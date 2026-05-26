/**
 * Lightweight structural validation. Does NOT replicate the Camunda 7 engine
 * deployment validation, but catches the most common modeling mistakes that
 * would break a deployment:
 *
 *  - Sequence/message flows without source or target.
 *  - Gateways with zero in or out flows.
 *  - Processes without a single bpmn:StartEvent / bpmn:EndEvent.
 *  - Boundary events not attached to any host.
 *  - ServiceTask without a Camunda implementation when the process is executable.
 */
import type { DiagramSession } from '../store.js';
import type { ModdleElement } from './moddle.js';

export interface BpmnIssue {
  severity: 'error' | 'warning';
  elementId?: string;
  message: string;
}

function walkFlowNodes(container: ModdleElement, cb: (node: ModdleElement) => void): void {
  const elements: ModdleElement[] = (container as any).flowElements ?? [];
  for (const el of elements) {
    cb(el);
    if (el.$type === 'bpmn:SubProcess' || el.$type === 'bpmn:Transaction' || el.$type === 'bpmn:AdHocSubProcess') {
      walkFlowNodes(el, cb);
    }
  }
}

export function validateDiagram(session: DiagramSession): BpmnIssue[] {
  const issues: BpmnIssue[] = [];
  const process = session.byId.get(session.processId);
  if (!process) {
    issues.push({ severity: 'error', message: `Process "${session.processId}" not found in session` });
    return issues;
  }
  const isExecutable = (process as any).isExecutable !== false;

  let startEvents = 0;
  let endEvents = 0;

  walkFlowNodes(process, (node) => {
    switch (node.$type) {
      case 'bpmn:StartEvent':
        startEvents += 1;
        break;
      case 'bpmn:EndEvent':
        endEvents += 1;
        break;
      case 'bpmn:ExclusiveGateway':
      case 'bpmn:InclusiveGateway':
      case 'bpmn:ParallelGateway':
      case 'bpmn:EventBasedGateway':
      case 'bpmn:ComplexGateway': {
        const incoming = ((node as any).incoming ?? []).length;
        const outgoing = ((node as any).outgoing ?? []).length;
        if (incoming === 0) issues.push({ severity: 'warning', elementId: (node as any).id, message: `Gateway "${(node as any).id}" has no incoming flows` });
        if (outgoing === 0) issues.push({ severity: 'warning', elementId: (node as any).id, message: `Gateway "${(node as any).id}" has no outgoing flows` });
        break;
      }
      case 'bpmn:BoundaryEvent': {
        const host = (node as any).attachedToRef;
        if (!host) issues.push({ severity: 'error', elementId: (node as any).id, message: `BoundaryEvent "${(node as any).id}" not attached to any activity` });
        break;
      }
      case 'bpmn:ServiceTask': {
        if (isExecutable) {
          const n = node as any;
          const hasImpl = n.class || n.expression || n.delegateExpression || n.type === 'external';
          if (!hasImpl) {
            issues.push({ severity: 'warning', elementId: n.id, message: `ServiceTask "${n.id}" has no camunda implementation (class/expression/delegateExpression/external)` });
          } else if (n.type === 'external' && !n.topic) {
            issues.push({ severity: 'error', elementId: n.id, message: `External ServiceTask "${n.id}" is missing camunda:topic` });
          }
        }
        break;
      }
      case 'bpmn:SequenceFlow':
      case 'bpmn:MessageFlow': {
        const src = (node as any).sourceRef;
        const tgt = (node as any).targetRef;
        if (!src) issues.push({ severity: 'error', elementId: (node as any).id, message: `${node.$type} "${(node as any).id}" missing sourceRef` });
        if (!tgt) issues.push({ severity: 'error', elementId: (node as any).id, message: `${node.$type} "${(node as any).id}" missing targetRef` });
        break;
      }
      default:
        break;
    }
  });

  if (startEvents === 0) issues.push({ severity: 'warning', message: 'Process has no StartEvent' });
  if (endEvents === 0) issues.push({ severity: 'warning', message: 'Process has no EndEvent' });

  return issues;
}
