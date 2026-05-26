/**
 * Regression tests for `set_io_mapping`. Covers:
 *  - default (replace) semantics on a fresh element
 *  - merge / append modes
 *  - calling the tool twice in a row (the previous implementation silently
 *    dropped existing inputs when the user called the tool a second time
 *    without `replace: true`)
 *  - reading parameters back via `get_element`
 *  - round-trip through XML keeps the parameters intact
 */
import { describe, expect, it } from 'vitest';
import { DiagramStore } from '../src/store.js';
import { Handlers } from '../src/tools/handlers.js';

async function call(handlers: Handlers, name: string, params: Record<string, unknown>): Promise<any> {
  const result = await handlers.dispatch(name, params);
  const text = result.content[0]?.text;
  if (result.isError) throw new Error(`tool ${name} errored: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function setupServiceTask(): Promise<{ handlers: Handlers; diagramId: string; taskId: string }> {
  const handlers = new Handlers(new DiagramStore());
  const { diagramId } = await call(handlers, 'create_diagram', {});
  const task = await call(handlers, 'add_task', { diagramId, type: 'bpmn:ServiceTask', name: 'T' });
  return { handlers, diagramId, taskId: task.id };
}

function extractInputOutput(xml: string): string | null {
  return xml.match(/<camunda:inputOutput[\s\S]*?<\/camunda:inputOutput>/)?.[0] ?? null;
}

describe('set_io_mapping', () => {
  it('writes the parameters to the BPMN XML on first call', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    const result = await call(handlers, 'set_io_mapping', {
      diagramId,
      elementId: taskId,
      inputs: [{ name: 'orderId', value: '${orderId}' }],
      outputs: [{ name: 'invoiceId', value: '${result.id}' }],
    });
    expect(result.inputOutput).toMatchObject({
      $type: 'camunda:InputOutput',
      inputParameters: [{ $type: 'camunda:InputParameter', name: 'orderId', value: '${orderId}' }],
      outputParameters: [{ $type: 'camunda:OutputParameter', name: 'invoiceId', value: '${result.id}' }],
    });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    expect(extractInputOutput(xml)).toContain('<camunda:inputParameter name="orderId">${orderId}</camunda:inputParameter>');
    expect(extractInputOutput(xml)).toContain('<camunda:outputParameter name="invoiceId">${result.id}</camunda:outputParameter>');
  });

  it('default mode (replace) overwrites previous inputs/outputs', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, inputs: [{ name: 'a', value: '1' }], outputs: [{ name: 'r', value: '2' }] });
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, inputs: [{ name: 'b', value: '3' }] });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    const io = extractInputOutput(xml) ?? '';
    expect(io).toContain('name="b"');
    expect(io).not.toContain('name="a"');
    expect(io).not.toContain('name="r"');
  });

  it('mode=merge overwrites parameters by name and keeps the rest', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, inputs: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }] });
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, mode: 'merge', inputs: [{ name: 'b', value: '20' }, { name: 'c', value: '30' }] });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    const io = extractInputOutput(xml) ?? '';
    expect(io).toContain('name="a">1');
    expect(io).toContain('name="b">20');
    expect(io).toContain('name="c">30');
  });

  it('mode=append keeps existing parameters and adds new ones at the end', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, inputs: [{ name: 'a', value: '1' }] });
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, mode: 'append', inputs: [{ name: 'b', value: '2' }] });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    const io = extractInputOutput(xml) ?? '';
    expect(io.indexOf('name="a"')).toBeGreaterThan(-1);
    expect(io.indexOf('name="b"')).toBeGreaterThan(io.indexOf('name="a"'));
  });

  it('supports camunda:Script as parameter body', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_io_mapping', {
      diagramId,
      elementId: taskId,
      outputs: [{ name: 'computed', script: { scriptFormat: 'javascript', value: 'execution.getVariable("x") + 1' } }],
    });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    expect(xml).toContain('<camunda:outputParameter name="computed">');
    expect(xml).toContain('<camunda:script scriptFormat="javascript">');
    expect(xml).toContain('execution.getVariable("x") + 1');
  });

  it('get_element exposes input/output parameter names and values', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_io_mapping', {
      diagramId,
      elementId: taskId,
      inputs: [{ name: 'orderId', value: '${orderId}' }],
      outputs: [{ name: 'invoiceId', value: '${result.id}' }],
    });
    const inspected = await call(handlers, 'get_element', { diagramId, elementId: taskId });
    const io = inspected.extensionElements[0];
    expect(io.$type).toBe('camunda:InputOutput');
    expect(io.inputParameters[0]).toMatchObject({ name: 'orderId', value: '${orderId}' });
    expect(io.outputParameters[0]).toMatchObject({ name: 'invoiceId', value: '${result.id}' });
  });

  it('survives XML round-trip and subsequent edits', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, inputs: [{ name: 'a', value: '1' }] });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    const reloaded = await call(handlers, 'load_diagram_xml', { xml });
    await call(handlers, 'set_io_mapping', { diagramId: reloaded.diagramId, elementId: taskId, mode: 'append', inputs: [{ name: 'b', value: '2' }] });
    const xml2 = (await call(handlers, 'get_diagram_xml', { diagramId: reloaded.diagramId })).xml as string;
    const io = extractInputOutput(xml2) ?? '';
    expect(io).toContain('name="a"');
    expect(io).toContain('name="b"');
  });

  it('coexists with other extension elements (properties, listeners) without dropping any', async () => {
    const { handlers, diagramId, taskId } = await setupServiceTask();
    await call(handlers, 'set_camunda_properties', { diagramId, elementId: taskId, properties: [{ name: 'p1', value: 'v1' }] });
    await call(handlers, 'add_execution_listener', { diagramId, elementId: taskId, event: 'start', expression: '${listener.notify(execution)}' });
    await call(handlers, 'set_io_mapping', { diagramId, elementId: taskId, inputs: [{ name: 'a', value: '1' }] });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    expect(xml).toContain('<camunda:properties>');
    expect(xml).toContain('<camunda:property name="p1"');
    expect(xml).toContain('<camunda:executionListener');
    expect(xml).toContain('<camunda:inputOutput>');
    expect(xml).toContain('<camunda:inputParameter name="a">1</camunda:inputParameter>');
  });
});
