/**
 * Camunda 7 extension helpers.
 *
 * All functions operate on the moddle tree using the namespace
 *   http://camunda.org/schema/1.0/bpmn (prefix `camunda`).
 *
 * The Camunda 7 model uses a mix of:
 *   - Direct attributes on bpmn elements (e.g. camunda:assignee on UserTask).
 *   - Children of bpmn:ExtensionElements (e.g. camunda:InputOutput,
 *     camunda:Properties, camunda:ExecutionListener, camunda:FormData).
 *   - Top-level rootElements (e.g. bpmn:Error, bpmn:Message, bpmn:Signal)
 *     referenced by event definitions.
 */
import type { BpmnBuilder } from './builder.js';
import type { BpmnModdleInstance, ModdleElement } from './moddle.js';

export type CamundaTaskImpl =
  | { kind: 'class'; value: string }
  | { kind: 'expression'; value: string; resultVariable?: string }
  | { kind: 'delegateExpression'; value: string }
  | { kind: 'external'; topic: string };

export function setTaskImplementation(el: ModdleElement, impl: CamundaTaskImpl): void {
  // Properties below are defined on the Camunda moddle extensions
  // (ServiceTaskLike / ExternalCapable) and therefore live on the bpmn
  // element without a `camunda:` prefix.
  delete (el as any).class;
  delete (el as any).expression;
  delete (el as any).delegateExpression;
  delete (el as any).type;
  delete (el as any).topic;
  delete (el as any).resultVariable;
  switch (impl.kind) {
    case 'class':
      (el as any).class = impl.value;
      break;
    case 'expression':
      (el as any).expression = impl.value;
      if (impl.resultVariable) (el as any).resultVariable = impl.resultVariable;
      break;
    case 'delegateExpression':
      (el as any).delegateExpression = impl.value;
      break;
    case 'external':
      (el as any).type = 'external';
      (el as any).topic = impl.topic;
      break;
  }
}

export interface AsyncOptions {
  asyncBefore?: boolean;
  asyncAfter?: boolean;
  exclusive?: boolean;
  jobPriority?: string;
}

export function setAsync(el: ModdleElement, opts: AsyncOptions): void {
  if (opts.asyncBefore !== undefined) (el as any).asyncBefore = opts.asyncBefore;
  if (opts.asyncAfter !== undefined) (el as any).asyncAfter = opts.asyncAfter;
  if (opts.exclusive !== undefined) (el as any).exclusive = opts.exclusive;
  if (opts.jobPriority !== undefined) (el as any).jobPriority = opts.jobPriority;
}

export interface UserTaskAssignment {
  assignee?: string;
  candidateUsers?: string;
  candidateGroups?: string;
  dueDate?: string;
  followUpDate?: string;
  priority?: string;
}

export function setUserTaskAssignment(el: ModdleElement, opts: UserTaskAssignment): void {
  if (el.$type !== 'bpmn:UserTask') throw new Error(`Assignment requires a UserTask, got ${el.$type}`);
  for (const [key, value] of Object.entries(opts)) {
    if (value !== undefined) (el as any)[key] = value;
  }
}

export interface CamundaFormField {
  id: string;
  label?: string;
  type?: 'string' | 'long' | 'boolean' | 'date' | 'enum';
  defaultValue?: string;
  values?: Array<{ id: string; name: string }>;
  required?: boolean;
}

export interface FormOptions {
  formKey?: string;
  formRef?: string;
  formRefBinding?: 'latest' | 'deployment' | 'version';
  formRefVersion?: string;
  fields?: CamundaFormField[];
}

export function setForm(builder: BpmnBuilder, el: ModdleElement, opts: FormOptions, moddle: BpmnModdleInstance): void {
  if (opts.formKey !== undefined) (el as any).formKey = opts.formKey;
  if (opts.formRef !== undefined) (el as any).formRef = opts.formRef;
  if (opts.formRefBinding !== undefined) (el as any).formRefBinding = opts.formRefBinding;
  if (opts.formRefVersion !== undefined) (el as any).formRefVersion = opts.formRefVersion;
  if (!opts.fields || opts.fields.length === 0) return;
  const ext = builder.ensureExtensionElements(el);
  // Drop any existing FormData and replace.
  (ext as any).values = (ext as any).values.filter((v: ModdleElement) => v.$type !== 'camunda:FormData');
  const fields: ModdleElement[] = [];
  for (const f of opts.fields) {
    const formField = moddle.create('camunda:FormField', {
      id: f.id,
      label: f.label,
      type: f.type ?? 'string',
      defaultValue: f.defaultValue,
    });
    if (f.required) {
      const validation = moddle.create('camunda:Validation', {
        constraints: [moddle.create('camunda:Constraint', { name: 'required' })],
      });
      (formField as any).validation = validation;
    }
    if (f.values && f.values.length > 0) {
      (formField as any).values = f.values.map((v) => moddle.create('camunda:Value', { id: v.id, name: v.name }));
    }
    fields.push(formField);
  }
  const formData = moddle.create('camunda:FormData', { fields });
  (formData as any).$parent = ext;
  (ext as any).values.push(formData);
}

export interface CamundaParameter {
  name: string;
  value?: string;
  script?: { scriptFormat: string; value: string };
}

export interface IoMappingOptions {
  /** When true, clear any existing camunda:InputOutput before applying. */
  replace?: boolean;
  inputs?: CamundaParameter[];
  outputs?: CamundaParameter[];
}

function buildParam(moddle: BpmnModdleInstance, kind: 'camunda:InputParameter' | 'camunda:OutputParameter', p: CamundaParameter): ModdleElement {
  const param = moddle.create(kind, { name: p.name });
  if (p.script) {
    const script = moddle.create('camunda:Script', { scriptFormat: p.script.scriptFormat, value: p.script.value });
    (param as any).definition = script;
  } else if (p.value !== undefined) {
    (param as any).value = p.value;
  }
  return param;
}

export function setIoMapping(builder: BpmnBuilder, el: ModdleElement, opts: IoMappingOptions, moddle: BpmnModdleInstance): void {
  const ext = builder.ensureExtensionElements(el);
  let io = ((ext as any).values as ModdleElement[]).find((v) => v.$type === 'camunda:InputOutput');
  if (opts.replace && io) {
    (ext as any).values = ((ext as any).values as ModdleElement[]).filter((v) => v !== io);
    io = undefined;
  }
  if (!io) {
    io = moddle.create('camunda:InputOutput', { inputParameters: [], outputParameters: [] });
    (io as any).$parent = ext;
    ((ext as any).values as ModdleElement[]).push(io);
  }
  if (opts.inputs) {
    (io as any).inputParameters = opts.inputs.map((p) => buildParam(moddle, 'camunda:InputParameter', p));
  }
  if (opts.outputs) {
    (io as any).outputParameters = opts.outputs.map((p) => buildParam(moddle, 'camunda:OutputParameter', p));
  }
}

export interface CamundaPropertyEntry {
  name: string;
  value: string;
}

export function setCamundaProperties(builder: BpmnBuilder, el: ModdleElement, entries: CamundaPropertyEntry[], moddle: BpmnModdleInstance): void {
  const ext = builder.ensureExtensionElements(el);
  (ext as any).values = ((ext as any).values as ModdleElement[]).filter((v) => v.$type !== 'camunda:Properties');
  if (entries.length === 0) return;
  const props = moddle.create('camunda:Properties', {
    values: entries.map((e) => moddle.create('camunda:Property', { name: e.name, value: e.value })),
  });
  (props as any).$parent = ext;
  ((ext as any).values as ModdleElement[]).push(props);
}

export interface CamundaListener {
  event: string;
  class?: string;
  expression?: string;
  delegateExpression?: string;
  script?: { scriptFormat: string; value: string };
}

function buildListener(moddle: BpmnModdleInstance, type: 'camunda:ExecutionListener' | 'camunda:TaskListener', listener: CamundaListener): ModdleElement {
  const props: Record<string, unknown> = { event: listener.event };
  if (listener.class) props['class'] = listener.class;
  if (listener.expression) props['expression'] = listener.expression;
  if (listener.delegateExpression) props['delegateExpression'] = listener.delegateExpression;
  const el = moddle.create(type, props);
  if (listener.script) {
    (el as any).script = moddle.create('camunda:Script', {
      scriptFormat: listener.script.scriptFormat,
      value: listener.script.value,
    });
  }
  return el;
}

export function addExecutionListener(builder: BpmnBuilder, el: ModdleElement, listener: CamundaListener, moddle: BpmnModdleInstance): ModdleElement {
  const ext = builder.ensureExtensionElements(el);
  const node = buildListener(moddle, 'camunda:ExecutionListener', listener);
  (node as any).$parent = ext;
  ((ext as any).values as ModdleElement[]).push(node);
  return node;
}

export function addTaskListener(builder: BpmnBuilder, el: ModdleElement, listener: CamundaListener, moddle: BpmnModdleInstance): ModdleElement {
  if (el.$type !== 'bpmn:UserTask') throw new Error(`TaskListener requires a UserTask, got ${el.$type}`);
  const ext = builder.ensureExtensionElements(el);
  const node = buildListener(moddle, 'camunda:TaskListener', listener);
  (node as any).$parent = ext;
  ((ext as any).values as ModdleElement[]).push(node);
  return node;
}

/** Locates or creates a top-level bpmn:Error rootElement matching the errorCode. */
function findOrCreateError(builder: BpmnBuilder, opts: { errorCode?: string; errorMessage?: string; name?: string }, moddle: BpmnModdleInstance): ModdleElement {
  const definitions = builder.session.definitions as any;
  const roots: ModdleElement[] = definitions.rootElements ?? [];
  if (opts.errorCode) {
    const found = roots.find((r) => r.$type === 'bpmn:Error' && (r as any).errorCode === opts.errorCode);
    if (found) return found;
  }
  const errorId = `Error_${(opts.errorCode ?? '').replace(/[^a-zA-Z0-9_]/g, '_') || Math.random().toString(36).slice(2, 8)}`;
  const error = moddle.create('bpmn:Error', {
    id: errorId,
    name: opts.name ?? opts.errorCode ?? errorId,
    errorCode: opts.errorCode,
  });
  if (opts.errorMessage) (error as any).errorMessage = opts.errorMessage;
  (error as any).$parent = definitions;
  roots.push(error);
  definitions.rootElements = roots;
  builder.session.byId.set(errorId, error);
  return error;
}

export function setErrorEventDefinition(builder: BpmnBuilder, event: ModdleElement, opts: { errorCode?: string; errorMessage?: string; name?: string; errorCodeVariable?: string; errorMessageVariable?: string }, moddle: BpmnModdleInstance): ModdleElement {
  const defs = ((event as any).eventDefinitions ?? []) as ModdleElement[];
  let def = defs.find((d) => d.$type === 'bpmn:ErrorEventDefinition');
  if (!def) {
    def = moddle.create('bpmn:ErrorEventDefinition', {});
    (def as any).$parent = event;
    defs.push(def);
    (event as any).eventDefinitions = defs;
  }
  if (opts.errorCode || opts.errorMessage || opts.name) {
    const error = findOrCreateError(builder, { errorCode: opts.errorCode, errorMessage: opts.errorMessage, name: opts.name }, moddle);
    (def as any).errorRef = error;
  }
  if (opts.errorCodeVariable) (def as any).errorCodeVariable = opts.errorCodeVariable;
  if (opts.errorMessageVariable) (def as any).errorMessageVariable = opts.errorMessageVariable;
  return def;
}

export type TimerKind = 'timeDuration' | 'timeCycle' | 'timeDate';

export function setTimerEventDefinition(event: ModdleElement, opts: { kind: TimerKind; expression: string; language?: string }, moddle: BpmnModdleInstance): ModdleElement {
  const defs = ((event as any).eventDefinitions ?? []) as ModdleElement[];
  let def = defs.find((d) => d.$type === 'bpmn:TimerEventDefinition');
  if (!def) {
    def = moddle.create('bpmn:TimerEventDefinition', {});
    (def as any).$parent = event;
    defs.push(def);
    (event as any).eventDefinitions = defs;
  }
  delete (def as any).timeDuration;
  delete (def as any).timeCycle;
  delete (def as any).timeDate;
  const expr = moddle.create('bpmn:FormalExpression', { body: opts.expression, language: opts.language });
  (def as any)[opts.kind] = expr;
  return def;
}

function findOrCreateMessage(builder: BpmnBuilder, name: string, moddle: BpmnModdleInstance): ModdleElement {
  const definitions = builder.session.definitions as any;
  const roots: ModdleElement[] = definitions.rootElements ?? [];
  const found = roots.find((r) => r.$type === 'bpmn:Message' && (r as any).name === name);
  if (found) return found;
  const messageId = `Message_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const message = moddle.create('bpmn:Message', { id: messageId, name });
  (message as any).$parent = definitions;
  roots.push(message);
  definitions.rootElements = roots;
  builder.session.byId.set(messageId, message);
  return message;
}

export function setMessageEventDefinition(builder: BpmnBuilder, event: ModdleElement, opts: { name: string }, moddle: BpmnModdleInstance): ModdleElement {
  const defs = ((event as any).eventDefinitions ?? []) as ModdleElement[];
  let def = defs.find((d) => d.$type === 'bpmn:MessageEventDefinition');
  if (!def) {
    def = moddle.create('bpmn:MessageEventDefinition', {});
    (def as any).$parent = event;
    defs.push(def);
    (event as any).eventDefinitions = defs;
  }
  const message = findOrCreateMessage(builder, opts.name, moddle);
  (def as any).messageRef = message;
  return def;
}

function findOrCreateSignal(builder: BpmnBuilder, name: string, moddle: BpmnModdleInstance): ModdleElement {
  const definitions = builder.session.definitions as any;
  const roots: ModdleElement[] = definitions.rootElements ?? [];
  const found = roots.find((r) => r.$type === 'bpmn:Signal' && (r as any).name === name);
  if (found) return found;
  const id = `Signal_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const signal = moddle.create('bpmn:Signal', { id, name });
  (signal as any).$parent = definitions;
  roots.push(signal);
  definitions.rootElements = roots;
  builder.session.byId.set(id, signal);
  return signal;
}

export function setSignalEventDefinition(builder: BpmnBuilder, event: ModdleElement, opts: { name: string }, moddle: BpmnModdleInstance): ModdleElement {
  const defs = ((event as any).eventDefinitions ?? []) as ModdleElement[];
  let def = defs.find((d) => d.$type === 'bpmn:SignalEventDefinition');
  if (!def) {
    def = moddle.create('bpmn:SignalEventDefinition', {});
    (def as any).$parent = event;
    defs.push(def);
    (event as any).eventDefinitions = defs;
  }
  const signal = findOrCreateSignal(builder, opts.name, moddle);
  (def as any).signalRef = signal;
  return def;
}

export interface ProcessAttributes {
  id?: string;
  name?: string;
  isExecutable?: boolean;
  versionTag?: string;
  historyTimeToLive?: string;
  jobPriority?: string;
  candidateStarterUsers?: string;
  candidateStarterGroups?: string;
  isStartableInTasklist?: boolean;
}

export function setProcessAttributes(process: ModdleElement, opts: ProcessAttributes): void {
  if (opts.id !== undefined) (process as any).id = opts.id;
  if (opts.name !== undefined) (process as any).name = opts.name;
  if (opts.isExecutable !== undefined) (process as any).isExecutable = opts.isExecutable;
  if (opts.versionTag !== undefined) (process as any).versionTag = opts.versionTag;
  if (opts.historyTimeToLive !== undefined) (process as any).historyTimeToLive = opts.historyTimeToLive;
  if (opts.jobPriority !== undefined) (process as any).jobPriority = opts.jobPriority;
  if (opts.candidateStarterUsers !== undefined) (process as any).candidateStarterUsers = opts.candidateStarterUsers;
  if (opts.candidateStarterGroups !== undefined) (process as any).candidateStarterGroups = opts.candidateStarterGroups;
  if (opts.isStartableInTasklist !== undefined) (process as any).isStartableInTasklist = opts.isStartableInTasklist;
}
