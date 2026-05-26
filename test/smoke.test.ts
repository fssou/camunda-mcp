/**
 * End-to-end exercise of the tool handlers without going through the MCP
 * transport. Verifies that the BPMN model survives a round-trip through the
 * XML serializer, auto-layout, and Camunda 7 extension helpers.
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

describe('camunda-mcp smoke', () => {
  it('creates a Camunda 7 diagram, adds elements, exports XML and round-trips', async () => {
    const store = new DiagramStore();
    const handlers = new Handlers(store);

    const created = await call(handlers, 'create_diagram', { name: 'Aprovação', processId: 'Approval_Process' });
    const diagramId = created.diagramId as string;
    expect(created.processId).toBe('Approval_Process');

    const start = await call(handlers, 'add_start_event', { diagramId, name: 'Pedido recebido' });
    const userTask = await call(handlers, 'add_task', { diagramId, type: 'bpmn:UserTask', name: 'Aprovar pedido' });
    const gateway = await call(handlers, 'add_gateway', { diagramId, type: 'bpmn:ExclusiveGateway', name: 'Aprovado?' });
    const serviceTask = await call(handlers, 'add_task', { diagramId, type: 'bpmn:ServiceTask', name: 'Faturar' });
    const endOk = await call(handlers, 'add_end_event', { diagramId, name: 'Pedido faturado' });
    const endReject = await call(handlers, 'add_end_event', { diagramId, name: 'Pedido recusado', eventDefinitionType: 'bpmn:ErrorEventDefinition' });

    await call(handlers, 'connect_elements', { diagramId, sourceId: start.id, targetId: userTask.id });
    await call(handlers, 'connect_elements', { diagramId, sourceId: userTask.id, targetId: gateway.id });
    await call(handlers, 'connect_elements', { diagramId, sourceId: gateway.id, targetId: serviceTask.id, name: 'Aprovado', conditionExpression: '${approved}' });
    await call(handlers, 'connect_elements', { diagramId, sourceId: serviceTask.id, targetId: endOk.id });
    await call(handlers, 'connect_elements', { diagramId, sourceId: gateway.id, targetId: endReject.id, name: 'Recusado' });

    await call(handlers, 'set_user_task_assignment', { diagramId, elementId: userTask.id, candidateGroups: 'gerentes', dueDate: 'P1D' });
    await call(handlers, 'set_form', { diagramId, elementId: userTask.id, formKey: 'embedded:app:forms/approve.html' });
    await call(handlers, 'set_async', { diagramId, elementId: userTask.id, asyncBefore: true, exclusive: true });
    await call(handlers, 'set_task_implementation', { diagramId, elementId: serviceTask.id, kind: 'delegateExpression', value: '${invoiceService}' });
    await call(handlers, 'set_io_mapping', { diagramId, elementId: serviceTask.id, inputs: [{ name: 'orderId', value: '${execution.getVariable("orderId")}' }], outputs: [{ name: 'invoiceId', value: '${result.id}' }] });
    await call(handlers, 'set_camunda_properties', { diagramId, elementId: serviceTask.id, properties: [{ name: 'retries', value: '5' }] });
    await call(handlers, 'add_execution_listener', { diagramId, elementId: serviceTask.id, event: 'end', expression: '${endListener.notify(execution)}' });
    await call(handlers, 'set_error_event_definition', { diagramId, elementId: endReject.id, errorCode: 'PEDIDO_RECUSADO', name: 'Pedido recusado' });
    await call(handlers, 'set_process_attributes', { diagramId, versionTag: '1.0.0', historyTimeToLive: 'P30D' });

    const validation = await call(handlers, 'validate_diagram', { diagramId });
    expect(validation.issues.filter((i: any) => i.severity === 'error')).toHaveLength(0);

    const exported = await call(handlers, 'get_diagram_xml', { diagramId });
    const xml = exported.xml as string;
    expect(xml).toContain('xmlns:camunda="http://camunda.org/schema/1.0/bpmn"');
    expect(xml).toContain('camunda:candidateGroups="gerentes"');
    expect(xml).toContain('camunda:formKey="embedded:app:forms/approve.html"');
    expect(xml).toContain('camunda:asyncBefore="true"');
    expect(xml).toContain('camunda:delegateExpression="${invoiceService}"');
    expect(xml).toContain('<camunda:inputOutput>');
    expect(xml).toContain('<camunda:executionListener');
    expect(xml).toContain('errorCode="PEDIDO_RECUSADO"');
    expect(xml).toContain('camunda:versionTag="1.0.0"');
    expect(xml).toContain('<bpmn:conditionExpression');

    // Round-trip: load the XML back and make sure ids survive.
    const reloaded = await call(handlers, 'load_diagram_xml', { xml });
    const elements = await call(handlers, 'list_elements', { diagramId: reloaded.diagramId });
    const ids = new Set(elements.elements.map((e: any) => e.id));
    expect(ids.has(start.id)).toBe(true);
    expect(ids.has(userTask.id)).toBe(true);
    expect(ids.has(endReject.id)).toBe(true);
  });

  it('auto-layouts a freshly built diagram', async () => {
    const store = new DiagramStore();
    const handlers = new Handlers(store);
    const created = await call(handlers, 'create_diagram', {});
    const diagramId = created.diagramId;
    const start = await call(handlers, 'add_start_event', { diagramId });
    const task = await call(handlers, 'add_task', { diagramId, type: 'bpmn:Task', name: 'Trabalho' });
    const end = await call(handlers, 'add_end_event', { diagramId });
    await call(handlers, 'connect_elements', { diagramId, sourceId: start.id, targetId: task.id });
    await call(handlers, 'connect_elements', { diagramId, sourceId: task.id, targetId: end.id });
    await call(handlers, 'auto_layout', { diagramId });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    expect(xml).toContain('<bpmndi:BPMNDiagram');
    expect(xml).toContain('<bpmndi:BPMNShape');
    expect(xml).toContain('<bpmndi:BPMNEdge');
  });

  it('builds a collaboration with pool, lane and message flow', async () => {
    const store = new DiagramStore();
    const handlers = new Handlers(store);
    const created = await call(handlers, 'create_diagram', { processId: 'BuyerProcess' });
    const diagramId = created.diagramId;
    const buyer = await call(handlers, 'add_participant', { diagramId, name: 'Comprador', processRef: 'BuyerProcess' });
    const seller = await call(handlers, 'add_participant', { diagramId, name: 'Vendedor', processRef: 'SellerProcess' });
    const lane = await call(handlers, 'add_lane', { diagramId, participantId: buyer.id, name: 'Operações' });
    const start = await call(handlers, 'add_start_event', { diagramId, parentId: 'BuyerProcess', name: 'Início' });
    const task = await call(handlers, 'add_task', { diagramId, parentId: 'BuyerProcess', name: 'Enviar pedido' });
    await call(handlers, 'connect_elements', { diagramId, sourceId: start.id, targetId: task.id });
    await call(handlers, 'assign_to_lane', { diagramId, elementId: start.id, laneId: lane.id });
    await call(handlers, 'assign_to_lane', { diagramId, elementId: task.id, laneId: lane.id });
    const sellerStart = await call(handlers, 'add_start_event', { diagramId, parentId: 'SellerProcess', name: 'Receber' });
    await call(handlers, 'add_message_flow', { diagramId, sourceId: task.id, targetId: sellerStart.id, name: 'Pedido' });
    const xml = (await call(handlers, 'get_diagram_xml', { diagramId })).xml as string;
    expect(xml).toContain('<bpmn:collaboration');
    expect(xml).toContain('<bpmn:participant');
    expect(xml).toContain('<bpmn:lane');
    expect(xml).toContain('<bpmn:messageFlow');
    void seller;
  });
});
