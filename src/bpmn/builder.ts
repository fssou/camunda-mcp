/**
 * BpmnBuilder — small set of mutation helpers that operate on a DiagramSession.
 *
 * Every helper keeps `session.byId` in sync with the moddle tree. The builder
 * never touches BPMN DI (BPMNDiagram / BPMNShape / BPMNEdge); use the
 * `auto_layout` tool to regenerate DI after structural changes.
 */
import type { DiagramSession } from '../store.js';
import { shortId } from '../store.js';
import type { BpmnModdleInstance, ModdleElement } from './moddle.js';
import type {
  EventDefinitionType,
  GatewayType,
  IntermediateEventType,
  SubProcessType,
  TaskType,
} from './types.js';

export interface AddElementOpts {
  id?: string;
  name?: string;
  /** Parent id; defaults to the process root. Use to nest inside a subprocess or lane. */
  parentId?: string;
}

export class BpmnBuilder {
  constructor(public session: DiagramSession, public moddle: BpmnModdleInstance) {}

  // -------------------------------------------------------------------------
  // Core lookups
  // -------------------------------------------------------------------------

  process(): ModdleElement {
    const p = this.session.byId.get(this.session.processId);
    if (!p) throw new Error(`Process "${this.session.processId}" missing from session index`);
    return p;
  }

  getElement(id: string): ModdleElement {
    const el = this.session.byId.get(id);
    if (!el) throw new Error(`Element "${id}" not found`);
    return el;
  }

  hasElement(id: string): boolean {
    return this.session.byId.has(id);
  }

  /** Parent container for new flow elements (process or expanded subprocess). */
  resolveContainer(parentId?: string): ModdleElement {
    if (!parentId) return this.process();
    const parent = this.getElement(parentId);
    if (
      parent.$type !== 'bpmn:Process' &&
      parent.$type !== 'bpmn:SubProcess' &&
      parent.$type !== 'bpmn:Transaction' &&
      parent.$type !== 'bpmn:AdHocSubProcess'
    ) {
      throw new Error(`Parent "${parentId}" (${parent.$type}) is not a Process or SubProcess`);
    }
    return parent;
  }

  // -------------------------------------------------------------------------
  // Generic flow node creation
  // -------------------------------------------------------------------------

  private nextId(prefix: string, custom?: string): string {
    if (custom) {
      if (this.session.byId.has(custom)) throw new Error(`Element id "${custom}" already exists`);
      return custom;
    }
    let candidate: string;
    do {
      candidate = `${prefix}_${shortId()}`;
    } while (this.session.byId.has(candidate));
    return candidate;
  }

  private prefixFor(type: string): string {
    // Strip namespace, e.g. bpmn:UserTask -> UserTask -> Activity_
    const local = type.split(':').pop() ?? 'Element';
    if (/Task$/.test(local) || local === 'CallActivity') return 'Activity';
    if (local === 'SubProcess' || local === 'Transaction' || local === 'AdHocSubProcess') return 'Activity';
    if (/Gateway$/.test(local)) return 'Gateway';
    if (/Event$/.test(local)) return 'Event';
    if (local === 'SequenceFlow') return 'Flow';
    if (local === 'MessageFlow') return 'Flow';
    if (local === 'Association') return 'Association';
    if (local === 'Participant') return 'Participant';
    if (local === 'Lane') return 'Lane';
    if (local === 'Collaboration') return 'Collaboration';
    if (local === 'TextAnnotation') return 'TextAnnotation';
    return local;
  }

  /** Creates a moddle element, registers in byId, and pushes into a container. */
  private create<T extends ModdleElement>(type: string, props: Record<string, unknown>, container?: ModdleElement, listKey = 'flowElements'): T {
    const id = (props.id as string | undefined) ?? this.nextId(this.prefixFor(type));
    const merged = { ...props, id };
    const element = this.moddle.create(type, merged) as T;
    this.session.byId.set(id, element);
    if (container) {
      const arr = ((container as any)[listKey] ?? []) as ModdleElement[];
      arr.push(element);
      (container as any)[listKey] = arr;
      (element as any).$parent = container;
    }
    return element;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  addStartEvent(opts: AddElementOpts & { eventDefinitionType?: EventDefinitionType } = {}): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    const props: Record<string, unknown> = { name: opts.name, id: opts.id };
    const start = this.create('bpmn:StartEvent', props, container);
    if (opts.eventDefinitionType) this.addEventDefinition(start, opts.eventDefinitionType);
    return start;
  }

  addEndEvent(opts: AddElementOpts & { eventDefinitionType?: EventDefinitionType } = {}): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    const end = this.create('bpmn:EndEvent', { name: opts.name, id: opts.id }, container);
    if (opts.eventDefinitionType) this.addEventDefinition(end, opts.eventDefinitionType);
    return end;
  }

  addIntermediateEvent(opts: AddElementOpts & { type: IntermediateEventType; eventDefinitionType?: EventDefinitionType }): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    const evt = this.create(opts.type, { name: opts.name, id: opts.id }, container);
    if (opts.eventDefinitionType) this.addEventDefinition(evt, opts.eventDefinitionType);
    return evt;
  }

  addBoundaryEvent(opts: AddElementOpts & {
    attachedToId: string;
    cancelActivity?: boolean;
    eventDefinitionType?: EventDefinitionType;
  }): ModdleElement {
    const host = this.getElement(opts.attachedToId);
    // Boundary events belong to the host activity's container, NOT to the host itself.
    const container = (host as any).$parent ?? this.process();
    const event = this.create('bpmn:BoundaryEvent', {
      name: opts.name,
      id: opts.id,
      attachedToRef: host,
      cancelActivity: opts.cancelActivity ?? true,
    }, container);
    if (opts.eventDefinitionType) this.addEventDefinition(event, opts.eventDefinitionType);
    return event;
  }

  addEventDefinition(event: ModdleElement, type: EventDefinitionType): ModdleElement {
    const def = this.moddle.create(type, {});
    (def as any).$parent = event;
    const list = ((event as any).eventDefinitions ?? []) as ModdleElement[];
    list.push(def);
    (event as any).eventDefinitions = list;
    return def;
  }

  // -------------------------------------------------------------------------
  // Activities
  // -------------------------------------------------------------------------

  addTask(opts: AddElementOpts & { type?: TaskType } = {}): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    const type = opts.type ?? 'bpmn:Task';
    return this.create(type, { name: opts.name, id: opts.id }, container);
  }

  addSubProcess(opts: AddElementOpts & {
    type?: SubProcessType;
    triggeredByEvent?: boolean;
  } = {}): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    const type = opts.type ?? 'bpmn:SubProcess';
    const props: Record<string, unknown> = { name: opts.name, id: opts.id, flowElements: [] };
    if (opts.triggeredByEvent !== undefined) props.triggeredByEvent = opts.triggeredByEvent;
    return this.create(type, props, container);
  }

  addCallActivity(opts: AddElementOpts & { calledElement?: string } = {}): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    return this.create('bpmn:CallActivity', {
      name: opts.name,
      id: opts.id,
      calledElement: opts.calledElement,
    }, container);
  }

  // -------------------------------------------------------------------------
  // Gateways
  // -------------------------------------------------------------------------

  addGateway(opts: AddElementOpts & { type?: GatewayType } = {}): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    const type = opts.type ?? 'bpmn:ExclusiveGateway';
    return this.create(type, { name: opts.name, id: opts.id }, container);
  }

  // -------------------------------------------------------------------------
  // Flows
  // -------------------------------------------------------------------------

  connect(opts: { sourceId: string; targetId: string; id?: string; name?: string; conditionExpression?: string; language?: string }): ModdleElement {
    const source = this.getElement(opts.sourceId);
    const target = this.getElement(opts.targetId);
    const container = (source as any).$parent ?? this.process();
    const flow = this.create('bpmn:SequenceFlow', {
      id: opts.id,
      name: opts.name,
      sourceRef: source,
      targetRef: target,
    }, container);
    this.appendRef(source, 'outgoing', flow);
    this.appendRef(target, 'incoming', flow);
    if (opts.conditionExpression) {
      const expr = this.moddle.create('bpmn:FormalExpression', {
        body: opts.conditionExpression,
        language: opts.language,
      });
      (flow as any).conditionExpression = expr;
    }
    return flow;
  }

  addMessageFlow(opts: { sourceId: string; targetId: string; id?: string; name?: string }): ModdleElement {
    const source = this.getElement(opts.sourceId);
    const target = this.getElement(opts.targetId);
    const collab = this.requireCollaboration();
    const flow = this.create('bpmn:MessageFlow', {
      id: opts.id,
      name: opts.name,
      sourceRef: source,
      targetRef: target,
    }, collab, 'messageFlows');
    return flow;
  }

  addAssociation(opts: { sourceId: string; targetId: string; id?: string; direction?: 'None' | 'One' | 'Both' }): ModdleElement {
    const source = this.getElement(opts.sourceId);
    const target = this.getElement(opts.targetId);
    const container = (source as any).$parent ?? this.process();
    const assoc = this.create('bpmn:Association', {
      id: opts.id,
      sourceRef: source,
      targetRef: target,
      associationDirection: opts.direction ?? 'None',
    }, container, 'artifacts');
    return assoc;
  }

  setDefaultFlow(elementId: string, flowId: string): void {
    const el = this.getElement(elementId);
    const flow = this.getElement(flowId);
    if (flow.$type !== 'bpmn:SequenceFlow') throw new Error(`"${flowId}" is not a SequenceFlow`);
    (el as any).default = flow;
  }

  setConditionExpression(flowId: string, body: string, language?: string): void {
    const flow = this.getElement(flowId);
    if (flow.$type !== 'bpmn:SequenceFlow') throw new Error(`"${flowId}" is not a SequenceFlow`);
    (flow as any).conditionExpression = this.moddle.create('bpmn:FormalExpression', { body, language });
  }

  // -------------------------------------------------------------------------
  // Annotations
  // -------------------------------------------------------------------------

  addTextAnnotation(opts: { id?: string; text: string; parentId?: string }): ModdleElement {
    const container = this.resolveContainer(opts.parentId);
    return this.create('bpmn:TextAnnotation', { id: opts.id, text: opts.text }, container, 'artifacts');
  }

  // -------------------------------------------------------------------------
  // Collaboration / pools / lanes
  // -------------------------------------------------------------------------

  requireCollaboration(): ModdleElement {
    if (this.session.collaborationId) {
      return this.getElement(this.session.collaborationId);
    }
    const definitions = this.session.definitions;
    const collab = this.moddle.create('bpmn:Collaboration', {
      id: this.nextId('Collaboration'),
      participants: [],
      messageFlows: [],
    });
    (collab as any).$parent = definitions;
    const roots: ModdleElement[] = (definitions as any).rootElements ?? [];
    // Insert collaboration BEFORE the process so it becomes the diagram root in DI.
    roots.unshift(collab);
    (definitions as any).rootElements = roots;
    this.session.byId.set(collab.id, collab);
    this.session.collaborationId = collab.id;
    return collab;
  }

  addParticipant(opts: { id?: string; name?: string; processRef?: string }): ModdleElement {
    const collab = this.requireCollaboration();
    let processRefId = opts.processRef ?? this.session.processId;
    let processRef = this.session.byId.get(processRefId);
    if (!processRef) {
      // Allocate a fresh process for this participant.
      const newId = processRefId === this.session.processId ? processRefId : opts.processRef ?? `Process_${shortId()}`;
      processRef = this.moddle.create('bpmn:Process', { id: newId, isExecutable: false, flowElements: [] });
      (processRef as any).$parent = this.session.definitions;
      const roots: ModdleElement[] = (this.session.definitions as any).rootElements ?? [];
      roots.push(processRef);
      (this.session.definitions as any).rootElements = roots;
      this.session.byId.set(newId, processRef);
      processRefId = newId;
    }
    const participant = this.create('bpmn:Participant', {
      id: opts.id,
      name: opts.name,
      processRef,
    }, collab, 'participants');
    return participant;
  }

  addLane(opts: { id?: string; name?: string; participantId: string }): ModdleElement {
    const participant = this.getElement(opts.participantId);
    if (participant.$type !== 'bpmn:Participant') throw new Error(`"${opts.participantId}" is not a Participant`);
    const process = this.getElement((participant as any).processRef.id);
    let laneSet: ModdleElement | undefined = ((process as any).laneSets ?? [])[0];
    if (!laneSet) {
      laneSet = this.moddle.create('bpmn:LaneSet', { id: this.nextId('LaneSet'), lanes: [] });
      (laneSet as any).$parent = process;
      (process as any).laneSets = [laneSet];
      this.session.byId.set(laneSet.id, laneSet);
    }
    const lane = this.create('bpmn:Lane', {
      id: opts.id,
      name: opts.name,
      flowNodeRef: [],
    }, laneSet!, 'lanes');
    return lane;
  }

  assignToLane(elementId: string, laneId: string): void {
    const lane = this.getElement(laneId);
    if (lane.$type !== 'bpmn:Lane') throw new Error(`"${laneId}" is not a Lane`);
    const element = this.getElement(elementId);
    const refs = ((lane as any).flowNodeRef ?? []) as ModdleElement[];
    if (!refs.includes(element)) refs.push(element);
    (lane as any).flowNodeRef = refs;
  }

  // -------------------------------------------------------------------------
  // Generic mutations
  // -------------------------------------------------------------------------

  setName(elementId: string, name: string): void {
    const el = this.getElement(elementId);
    (el as any).name = name;
  }

  setDocumentation(elementId: string, text: string, textFormat = 'text/plain'): void {
    const el = this.getElement(elementId);
    const doc = this.moddle.create('bpmn:Documentation', { text, textFormat });
    (doc as any).$parent = el;
    (el as any).documentation = [doc];
  }

  /** Removes a flow node, sequence/message flow, or other element from its parent. */
  deleteElement(elementId: string): void {
    const el = this.getElement(elementId);
    const parent = (el as any).$parent;
    if (parent) {
      for (const key of ['flowElements', 'artifacts', 'participants', 'messageFlows', 'lanes', 'eventDefinitions']) {
        if (Array.isArray((parent as any)[key])) {
          (parent as any)[key] = (parent as any)[key].filter((x: ModdleElement) => x !== el);
        }
      }
    }
    // Detach inbound/outbound references for flows
    if (el.$type === 'bpmn:SequenceFlow' || el.$type === 'bpmn:MessageFlow') {
      const src = (el as any).sourceRef;
      const tgt = (el as any).targetRef;
      if (src && Array.isArray(src.outgoing)) src.outgoing = src.outgoing.filter((f: ModdleElement) => f !== el);
      if (tgt && Array.isArray(tgt.incoming)) tgt.incoming = tgt.incoming.filter((f: ModdleElement) => f !== el);
    } else {
      // Flow node: delete any sequence flows pointing to/from it
      const toDelete: string[] = [];
      for (const [id, candidate] of this.session.byId.entries()) {
        if (candidate.$type === 'bpmn:SequenceFlow' || candidate.$type === 'bpmn:MessageFlow') {
          if ((candidate as any).sourceRef === el || (candidate as any).targetRef === el) toDelete.push(id);
        }
      }
      for (const id of toDelete) this.deleteElement(id);
    }
    this.session.byId.delete(elementId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private appendRef(node: ModdleElement, key: 'incoming' | 'outgoing', flow: ModdleElement): void {
    const arr = ((node as any)[key] ?? []) as ModdleElement[];
    if (!arr.includes(flow)) arr.push(flow);
    (node as any)[key] = arr;
  }

  /** Returns or creates the bpmn:ExtensionElements child of an element. */
  ensureExtensionElements(element: ModdleElement): ModdleElement {
    let ext = (element as any).extensionElements as ModdleElement | undefined;
    if (!ext) {
      ext = this.moddle.create('bpmn:ExtensionElements', { values: [] });
      (ext as any).$parent = element;
      (element as any).extensionElements = ext;
    }
    if (!Array.isArray((ext as any).values)) (ext as any).values = [];
    return ext;
  }
}
