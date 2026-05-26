/**
 * Single-entry dispatch: routes a tool name + raw params to the right
 * handler. Returns an MCP CallToolResult (text content with JSON payload).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { BpmnBuilder } from '../bpmn/builder.js';
import {
  addExecutionListener,
  addTaskListener,
  setAsync,
  setCamundaProperties,
  setErrorEventDefinition,
  setForm,
  setIoMapping,
  setMessageEventDefinition,
  setProcessAttributes,
  setSignalEventDefinition,
  setTaskImplementation,
  setTimerEventDefinition,
  setUserTaskAssignment,
} from '../bpmn/camunda.js';
import { autoLayoutSession } from '../bpmn/layout.js';
import type { ModdleElement } from '../bpmn/moddle.js';
import type { DiagramStore } from '../store.js';
import { sessionToXml } from '../bpmn/xml.js';
import { validateDiagram } from '../bpmn/validate.js';
import {
  TOOLS,
  type ToolDefinition,
} from './registry.js';

export interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function ok(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

function describeElement(el: ModdleElement): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    id: (el as any).id,
    type: (el as any).$type,
    name: (el as any).name,
  };
  if ((el as any).attachedToRef) summary.attachedToId = (el as any).attachedToRef.id;
  if ((el as any).sourceRef) summary.sourceId = (el as any).sourceRef.id;
  if ((el as any).targetRef) summary.targetId = (el as any).targetRef.id;
  const eds = ((el as any).eventDefinitions ?? []) as ModdleElement[];
  if (eds.length) summary.eventDefinitions = eds.map((d) => d.$type);
  return summary;
}

export class Handlers {
  constructor(private store: DiagramStore) {}

  toolDefinitions(): ToolDefinition[] {
    return TOOLS;
  }

  async dispatch(name: string, rawParams: unknown): Promise<CallToolResult> {
    const def = TOOLS.find((t) => t.name === name);
    if (!def) return fail(`Unknown tool: ${name}`);
    let params: any;
    try {
      params = def.schema.parse(rawParams ?? {});
    } catch (err) {
      if (err instanceof z.ZodError) return fail(`Invalid params for ${name}: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      throw err;
    }
    try {
      const result = await this.run(name, params);
      return result;
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  private builder(diagramId: string): BpmnBuilder {
    const session = this.store.get(diagramId);
    return new BpmnBuilder(session, this.store.getModdle());
  }

  private async run(name: string, p: any): Promise<CallToolResult> {
    switch (name) {
      // -- Diagram lifecycle --------------------------------------------------
      case 'create_diagram': {
        const session = this.store.create(p);
        return ok({ diagramId: session.id, processId: session.processId });
      }
      case 'list_diagrams': {
        const sessions = this.store.list().map((s) => ({ id: s.id, processId: s.processId, collaborationId: s.collaborationId, filePath: s.filePath, elementCount: s.byId.size }));
        return ok({ diagrams: sessions });
      }
      case 'delete_diagram': {
        const removed = this.store.delete(p.diagramId);
        return ok({ removed });
      }
      case 'load_diagram_xml': {
        const session = await this.store.loadXml(p.xml, p.diagramId);
        return ok({ diagramId: session.id, processId: session.processId, collaborationId: session.collaborationId, elementCount: session.byId.size });
      }
      case 'load_diagram_file': {
        const absPath = path.resolve(p.filePath);
        const xml = await fs.readFile(absPath, 'utf8');
        const session = await this.store.loadXml(xml, p.diagramId);
        session.filePath = absPath;
        return ok({ diagramId: session.id, processId: session.processId, filePath: absPath, elementCount: session.byId.size });
      }
      case 'get_diagram_xml': {
        const session = this.store.get(p.diagramId);
        const xml = await sessionToXml(session, this.store.getModdle(), { format: p.format ?? true, preamble: true });
        return ok({ xml });
      }
      case 'save_diagram': {
        const session = this.store.get(p.diagramId);
        const xml = await sessionToXml(session, this.store.getModdle(), { format: true, preamble: true });
        const absPath = path.resolve(p.filePath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, xml, 'utf8');
        session.filePath = absPath;
        return ok({ filePath: absPath, bytes: Buffer.byteLength(xml) });
      }
      case 'auto_layout': {
        const session = this.store.get(p.diagramId);
        const xml = await autoLayoutSession(session, this.store.getModdle());
        return ok({ diagramId: session.id, bytes: Buffer.byteLength(xml) });
      }
      case 'validate_diagram': {
        const session = this.store.get(p.diagramId);
        const issues = validateDiagram(session);
        return ok({ issues });
      }

      // -- Elements -----------------------------------------------------------
      case 'add_start_event': {
        const b = this.builder(p.diagramId);
        const el = b.addStartEvent({ id: p.id, name: p.name, parentId: p.parentId, eventDefinitionType: p.eventDefinitionType });
        return ok(describeElement(el));
      }
      case 'add_end_event': {
        const b = this.builder(p.diagramId);
        const el = b.addEndEvent({ id: p.id, name: p.name, parentId: p.parentId, eventDefinitionType: p.eventDefinitionType });
        return ok(describeElement(el));
      }
      case 'add_intermediate_event': {
        const b = this.builder(p.diagramId);
        const el = b.addIntermediateEvent({ id: p.id, name: p.name, parentId: p.parentId, type: p.type, eventDefinitionType: p.eventDefinitionType });
        return ok(describeElement(el));
      }
      case 'add_boundary_event': {
        const b = this.builder(p.diagramId);
        const el = b.addBoundaryEvent({
          id: p.id, name: p.name, attachedToId: p.attachedToId, cancelActivity: p.cancelActivity, eventDefinitionType: p.eventDefinitionType,
        });
        return ok(describeElement(el));
      }
      case 'add_task': {
        const b = this.builder(p.diagramId);
        const el = b.addTask({ id: p.id, name: p.name, parentId: p.parentId, type: p.type });
        return ok(describeElement(el));
      }
      case 'add_gateway': {
        const b = this.builder(p.diagramId);
        const el = b.addGateway({ id: p.id, name: p.name, parentId: p.parentId, type: p.type });
        return ok(describeElement(el));
      }
      case 'add_subprocess': {
        const b = this.builder(p.diagramId);
        const el = b.addSubProcess({ id: p.id, name: p.name, parentId: p.parentId, type: p.type, triggeredByEvent: p.triggeredByEvent });
        return ok(describeElement(el));
      }
      case 'add_call_activity': {
        const b = this.builder(p.diagramId);
        const el = b.addCallActivity({ id: p.id, name: p.name, parentId: p.parentId, calledElement: p.calledElement });
        return ok(describeElement(el));
      }
      case 'add_text_annotation': {
        const b = this.builder(p.diagramId);
        const el = b.addTextAnnotation({ id: p.id, text: p.text, parentId: p.parentId });
        return ok(describeElement(el));
      }
      case 'delete_element': {
        const b = this.builder(p.diagramId);
        b.deleteElement(p.elementId);
        return ok({ deleted: p.elementId });
      }
      case 'list_elements': {
        const session = this.store.get(p.diagramId);
        const out: Array<Record<string, unknown>> = [];
        for (const el of session.byId.values()) {
          const type = (el as any).$type;
          if (p.typePrefix && !type.startsWith(p.typePrefix)) continue;
          if (p.parentId) {
            const parentId = (el as any).$parent?.id;
            if (parentId !== p.parentId) continue;
          }
          out.push(describeElement(el));
        }
        return ok({ elements: out });
      }
      case 'get_element': {
        const b = this.builder(p.diagramId);
        const el = b.getElement(p.elementId);
        const summary = describeElement(el);
        const ext = (el as any).extensionElements as ModdleElement | undefined;
        if (ext) {
          summary.extensionElements = ((ext as any).values ?? []).map((v: ModdleElement) => ({ type: (v as any).$type, ...stringifyShallow(v) }));
        }
        // Surface Camunda extension attributes (from the camunda moddle package).
        const CAMUNDA_ATTRS = [
          'assignee', 'candidateUsers', 'candidateGroups', 'dueDate', 'followUpDate', 'priority',
          'asyncBefore', 'asyncAfter', 'exclusive', 'jobPriority',
          'class', 'expression', 'delegateExpression', 'resultVariable', 'type', 'topic',
          'formKey', 'formRef', 'formRefBinding', 'formRefVersion',
          'versionTag', 'historyTimeToLive', 'candidateStarterGroups', 'candidateStarterUsers', 'isStartableInTasklist',
          'errorCode', 'errorMessage', 'errorCodeVariable', 'errorMessageVariable',
          'calledElementBinding', 'calledElementVersion', 'calledElementTenantId',
        ];
        const camundaAttrs: Record<string, unknown> = {};
        for (const key of CAMUNDA_ATTRS) {
          const value = (el as any)[key];
          if (value !== undefined) camundaAttrs[key] = value;
        }
        if (Object.keys(camundaAttrs).length) summary.camunda = camundaAttrs;
        return ok(summary);
      }
      case 'set_name': {
        const b = this.builder(p.diagramId);
        b.setName(p.elementId, p.name);
        return ok({ elementId: p.elementId, name: p.name });
      }
      case 'set_documentation': {
        const b = this.builder(p.diagramId);
        b.setDocumentation(p.elementId, p.text, p.textFormat);
        return ok({ elementId: p.elementId });
      }

      // -- Flows --------------------------------------------------------------
      case 'connect_elements': {
        const b = this.builder(p.diagramId);
        const flow = b.connect({ sourceId: p.sourceId, targetId: p.targetId, id: p.id, name: p.name, conditionExpression: p.conditionExpression, language: p.language });
        return ok(describeElement(flow));
      }
      case 'add_message_flow': {
        const b = this.builder(p.diagramId);
        const flow = b.addMessageFlow({ sourceId: p.sourceId, targetId: p.targetId, id: p.id, name: p.name });
        return ok(describeElement(flow));
      }
      case 'add_association': {
        const b = this.builder(p.diagramId);
        const assoc = b.addAssociation({ sourceId: p.sourceId, targetId: p.targetId, id: p.id, direction: p.direction });
        return ok(describeElement(assoc));
      }
      case 'set_default_flow': {
        const b = this.builder(p.diagramId);
        b.setDefaultFlow(p.elementId, p.flowId);
        return ok({ elementId: p.elementId, default: p.flowId });
      }
      case 'set_condition_expression': {
        const b = this.builder(p.diagramId);
        b.setConditionExpression(p.flowId, p.expression, p.language);
        return ok({ flowId: p.flowId });
      }

      // -- Collaboration ------------------------------------------------------
      case 'add_participant': {
        const b = this.builder(p.diagramId);
        const part = b.addParticipant({ id: p.id, name: p.name, processRef: p.processRef });
        return ok(describeElement(part));
      }
      case 'add_lane': {
        const b = this.builder(p.diagramId);
        const lane = b.addLane({ id: p.id, name: p.name, participantId: p.participantId });
        return ok(describeElement(lane));
      }
      case 'assign_to_lane': {
        const b = this.builder(p.diagramId);
        b.assignToLane(p.elementId, p.laneId);
        return ok({ elementId: p.elementId, laneId: p.laneId });
      }

      // -- Camunda 7 ----------------------------------------------------------
      case 'set_task_implementation': {
        const b = this.builder(p.diagramId);
        const el = b.getElement(p.elementId);
        if (p.kind === 'external') {
          if (!p.topic) throw new Error('topic is required when kind=external');
          setTaskImplementation(el, { kind: 'external', topic: p.topic });
        } else {
          if (!p.value) throw new Error(`value is required when kind=${p.kind}`);
          setTaskImplementation(el, { kind: p.kind, value: p.value, ...(p.kind === 'expression' ? { resultVariable: p.resultVariable } : {}) });
        }
        return ok({ elementId: p.elementId, kind: p.kind });
      }
      case 'set_async': {
        const b = this.builder(p.diagramId);
        setAsync(b.getElement(p.elementId), { asyncBefore: p.asyncBefore, asyncAfter: p.asyncAfter, exclusive: p.exclusive, jobPriority: p.jobPriority });
        return ok({ elementId: p.elementId });
      }
      case 'set_user_task_assignment': {
        const b = this.builder(p.diagramId);
        setUserTaskAssignment(b.getElement(p.elementId), {
          assignee: p.assignee, candidateUsers: p.candidateUsers, candidateGroups: p.candidateGroups, dueDate: p.dueDate, followUpDate: p.followUpDate, priority: p.priority,
        });
        return ok({ elementId: p.elementId });
      }
      case 'set_form': {
        const b = this.builder(p.diagramId);
        setForm(b, b.getElement(p.elementId), {
          formKey: p.formKey, formRef: p.formRef, formRefBinding: p.formRefBinding, formRefVersion: p.formRefVersion, fields: p.fields,
        }, this.store.getModdle());
        return ok({ elementId: p.elementId });
      }
      case 'set_io_mapping': {
        const b = this.builder(p.diagramId);
        setIoMapping(b, b.getElement(p.elementId), { replace: p.replace, inputs: p.inputs, outputs: p.outputs }, this.store.getModdle());
        return ok({ elementId: p.elementId });
      }
      case 'set_camunda_properties': {
        const b = this.builder(p.diagramId);
        setCamundaProperties(b, b.getElement(p.elementId), p.properties, this.store.getModdle());
        return ok({ elementId: p.elementId });
      }
      case 'add_execution_listener': {
        const b = this.builder(p.diagramId);
        const node = addExecutionListener(b, b.getElement(p.elementId), {
          event: p.event, class: p.class, expression: p.expression, delegateExpression: p.delegateExpression, script: p.script,
        }, this.store.getModdle());
        return ok({ elementId: p.elementId, listener: (node as any).$type });
      }
      case 'add_task_listener': {
        const b = this.builder(p.diagramId);
        const node = addTaskListener(b, b.getElement(p.elementId), {
          event: p.event, class: p.class, expression: p.expression, delegateExpression: p.delegateExpression, script: p.script,
        }, this.store.getModdle());
        return ok({ elementId: p.elementId, listener: (node as any).$type });
      }
      case 'set_error_event_definition': {
        const b = this.builder(p.diagramId);
        setErrorEventDefinition(b, b.getElement(p.elementId), {
          errorCode: p.errorCode, errorMessage: p.errorMessage, name: p.name, errorCodeVariable: p.errorCodeVariable, errorMessageVariable: p.errorMessageVariable,
        }, this.store.getModdle());
        return ok({ elementId: p.elementId });
      }
      case 'set_timer_event_definition': {
        const b = this.builder(p.diagramId);
        setTimerEventDefinition(b.getElement(p.elementId), { kind: p.kind, expression: p.expression, language: p.language }, this.store.getModdle());
        return ok({ elementId: p.elementId, kind: p.kind });
      }
      case 'set_message_event_definition': {
        const b = this.builder(p.diagramId);
        setMessageEventDefinition(b, b.getElement(p.elementId), { name: p.name }, this.store.getModdle());
        return ok({ elementId: p.elementId, message: p.name });
      }
      case 'set_signal_event_definition': {
        const b = this.builder(p.diagramId);
        setSignalEventDefinition(b, b.getElement(p.elementId), { name: p.name }, this.store.getModdle());
        return ok({ elementId: p.elementId, signal: p.name });
      }
      case 'set_process_attributes': {
        const b = this.builder(p.diagramId);
        const process = b.process();
        setProcessAttributes(process, p);
        if (p.id && p.id !== b.session.processId) {
          // Re-key the byId index when the process id changes.
          b.session.byId.delete(b.session.processId);
          b.session.processId = p.id;
          b.session.byId.set(p.id, process);
        }
        return ok({ processId: b.session.processId });
      }
      default:
        return fail(`Unhandled tool: ${name}`);
    }
  }
}

function stringifyShallow(v: ModdleElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v as any)) {
    if (key.startsWith('$')) continue;
    const value = (v as any)[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && (value as any).$type) {
      out[key] = { $type: (value as any).$type, id: (value as any).id };
    } else if (Array.isArray(value)) {
      out[key] = value.map((item: any) => (item && item.$type ? { $type: item.$type, id: item.id } : item));
    } else {
      out[key] = value;
    }
  }
  return out;
}
