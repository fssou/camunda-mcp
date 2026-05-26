/**
 * Zod schemas for every MCP tool exposed by this server. The schemas double as
 * machine-readable docs for the LLM. Keep `.describe()` text short, action-oriented.
 */
import { z } from 'zod';
import { EVENT_DEFINITION_TYPES, GATEWAY_TYPES, INTERMEDIATE_EVENT_TYPES, SUBPROCESS_TYPES, TASK_TYPES } from '../bpmn/types.js';

// ---------------------------------------------------------------------------
// Diagram lifecycle
// ---------------------------------------------------------------------------

export const createDiagramSchema = z.object({
  name: z.string().optional().describe('Process name'),
  processId: z.string().optional().describe('Process id (default Process_xxx)'),
  isExecutable: z.boolean().optional().describe('Process isExecutable (default true)'),
  targetNamespace: z.string().optional().describe('targetNamespace attribute on Definitions'),
});

export const listDiagramsSchema = z.object({});

export const deleteDiagramSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
});

export const loadDiagramXmlSchema = z.object({
  xml: z.string().describe('BPMN 2.0 XML to import'),
  diagramId: z.string().optional().describe('Optional session id to replace; otherwise a new id is allocated'),
});

export const loadDiagramFileSchema = z.object({
  filePath: z.string().describe('Absolute path to a .bpmn file'),
  diagramId: z.string().optional().describe('Optional session id to replace'),
});

export const getDiagramXmlSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  format: z.boolean().optional().describe('Pretty-print (default true)'),
});

export const saveDiagramSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  filePath: z.string().describe('Absolute path to write the .bpmn file to'),
});

export const autoLayoutSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
});

export const validateDiagramSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
});

// ---------------------------------------------------------------------------
// Element schemas (shared bits)
// ---------------------------------------------------------------------------

const elementBase = {
  diagramId: z.string().describe('Diagram session id'),
  id: z.string().optional().describe('Custom element id (auto-generated if omitted)'),
  name: z.string().optional().describe('Element label'),
  parentId: z.string().optional().describe('Container element id (Process or expanded SubProcess)'),
};

export const addStartEventSchema = z.object({
  ...elementBase,
  eventDefinitionType: z.enum(EVENT_DEFINITION_TYPES).optional().describe('Event definition (none if omitted)'),
});

export const addEndEventSchema = z.object({
  ...elementBase,
  eventDefinitionType: z.enum(EVENT_DEFINITION_TYPES).optional().describe('Event definition (none if omitted)'),
});

export const addIntermediateEventSchema = z.object({
  ...elementBase,
  type: z.enum(INTERMEDIATE_EVENT_TYPES).describe('IntermediateCatchEvent or IntermediateThrowEvent'),
  eventDefinitionType: z.enum(EVENT_DEFINITION_TYPES).optional(),
});

export const addBoundaryEventSchema = z.object({
  ...elementBase,
  attachedToId: z.string().describe('Host activity id'),
  cancelActivity: z.boolean().optional().describe('Interrupting (true, default) vs non-interrupting (false)'),
  eventDefinitionType: z.enum(EVENT_DEFINITION_TYPES).optional(),
});

export const addTaskSchema = z.object({
  ...elementBase,
  type: z.enum(TASK_TYPES).optional().describe('Task variant (default bpmn:Task)'),
});

export const addGatewaySchema = z.object({
  ...elementBase,
  type: z.enum(GATEWAY_TYPES).optional().describe('Gateway variant (default bpmn:ExclusiveGateway)'),
});

export const addSubprocessSchema = z.object({
  ...elementBase,
  type: z.enum(SUBPROCESS_TYPES).optional().describe('Sub-process variant'),
  triggeredByEvent: z.boolean().optional().describe('Event sub-process flag'),
});

export const addCallActivitySchema = z.object({
  ...elementBase,
  calledElement: z.string().optional().describe('Called process id (camunda:calledElement)'),
});

export const addTextAnnotationSchema = z.object({
  ...elementBase,
  text: z.string().describe('Annotation text'),
});

export const deleteElementSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id to delete'),
});

export const listElementsSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  typePrefix: z.string().optional().describe('Filter by BPMN type prefix, e.g. "bpmn:Task"'),
  parentId: z.string().optional().describe('Filter to children of a container'),
});

export const getElementSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id'),
});

export const setNameSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id'),
  name: z.string().describe('New name'),
});

export const setDocumentationSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id'),
  text: z.string().describe('Documentation text'),
  textFormat: z.string().optional().describe('Documentation text format (default text/plain)'),
});

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export const connectElementsSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  sourceId: z.string().describe('Source element id'),
  targetId: z.string().describe('Target element id'),
  id: z.string().optional().describe('Custom sequence flow id'),
  name: z.string().optional().describe('Sequence flow label'),
  conditionExpression: z.string().optional().describe('FormalExpression body (e.g. ${approved})'),
  language: z.string().optional().describe('Condition language (e.g. juel, feel)'),
});

export const addMessageFlowSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  sourceId: z.string().describe('Source element id (in a participant)'),
  targetId: z.string().describe('Target element id (in another participant)'),
  id: z.string().optional(),
  name: z.string().optional(),
});

export const addAssociationSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  sourceId: z.string().describe('Source element id'),
  targetId: z.string().describe('Target element id'),
  id: z.string().optional(),
  direction: z.enum(['None', 'One', 'Both']).optional(),
});

export const setDefaultFlowSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Gateway or activity id that owns the default'),
  flowId: z.string().describe('Sequence flow id to mark as default'),
});

export const setConditionExpressionSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  flowId: z.string().describe('Sequence flow id'),
  expression: z.string().describe('FormalExpression body'),
  language: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Collaboration
// ---------------------------------------------------------------------------

export const addParticipantSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  id: z.string().optional(),
  name: z.string().optional(),
  processRef: z.string().optional().describe('Existing process id to reference; otherwise the session process is used'),
});

export const addLaneSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  participantId: z.string().describe('Participant (pool) id'),
  id: z.string().optional(),
  name: z.string().optional(),
});

export const assignToLaneSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Flow node id to assign'),
  laneId: z.string().describe('Lane id'),
});

// ---------------------------------------------------------------------------
// Camunda 7 extensions
// ---------------------------------------------------------------------------

export const setTaskImplementationSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Task element id'),
  kind: z.enum(['class', 'expression', 'delegateExpression', 'external']).describe('Implementation kind'),
  value: z.string().optional().describe('Class name / expression / delegateExpression value'),
  topic: z.string().optional().describe('External task topic (required when kind=external)'),
  resultVariable: z.string().optional().describe('Result variable for expression implementations'),
});

export const setAsyncSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id'),
  asyncBefore: z.boolean().optional(),
  asyncAfter: z.boolean().optional(),
  exclusive: z.boolean().optional(),
  jobPriority: z.string().optional(),
});

export const setUserTaskAssignmentSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('UserTask id'),
  assignee: z.string().optional(),
  candidateUsers: z.string().optional(),
  candidateGroups: z.string().optional(),
  dueDate: z.string().optional(),
  followUpDate: z.string().optional(),
  priority: z.string().optional(),
});

export const setFormSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('UserTask or StartEvent id'),
  formKey: z.string().optional().describe('camunda:formKey attribute'),
  formRef: z.string().optional().describe('camunda:formRef attribute'),
  formRefBinding: z.enum(['latest', 'deployment', 'version']).optional(),
  formRefVersion: z.string().optional(),
  fields: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    type: z.enum(['string', 'long', 'boolean', 'date', 'enum']).optional(),
    defaultValue: z.string().optional(),
    required: z.boolean().optional(),
    values: z.array(z.object({ id: z.string(), name: z.string() })).optional().describe('Enum values'),
  })).optional().describe('camunda:formData fields'),
});

export const setIoMappingSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Activity / event / gateway id to receive camunda:InputOutput'),
  mode: z.enum(['replace', 'merge', 'append']).optional().describe(
    'How to combine with existing parameters. `replace` (default) discards the existing camunda:InputOutput and writes fresh inputs/outputs. `merge` keeps any existing parameters whose `name` is NOT in the new list and overwrites those that ARE. `append` keeps all existing parameters and adds the new ones (duplicates allowed). For backward compatibility, the legacy `replace` boolean is still honored when `mode` is absent.',
  ),
  replace: z.boolean().optional().describe('Deprecated. Same as mode="replace". Kept for backward compatibility.'),
  inputs: z.array(z.object({
    name: z.string().describe('camunda:InputParameter name'),
    value: z.string().optional().describe('Literal/expression body of the parameter (e.g. ${orderId})'),
    script: z.object({ scriptFormat: z.string(), value: z.string() }).optional().describe('camunda:Script body (mutually exclusive with value)'),
  })).optional().describe('camunda:InputParameter list. Pass an empty array to remove all inputs (with mode=replace).'),
  outputs: z.array(z.object({
    name: z.string().describe('camunda:OutputParameter name'),
    value: z.string().optional(),
    script: z.object({ scriptFormat: z.string(), value: z.string() }).optional(),
  })).optional().describe('camunda:OutputParameter list. Pass an empty array to remove all outputs (with mode=replace).'),
});

export const setCamundaPropertiesSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id'),
  properties: z.array(z.object({ name: z.string(), value: z.string() })),
});

export const addExecutionListenerSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Element id'),
  event: z.enum(['start', 'end', 'take']).describe('Listener event'),
  class: z.string().optional(),
  expression: z.string().optional(),
  delegateExpression: z.string().optional(),
  script: z.object({ scriptFormat: z.string(), value: z.string() }).optional(),
});

export const addTaskListenerSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('UserTask id'),
  event: z.enum(['create', 'assignment', 'complete', 'delete', 'update', 'timeout']).describe('Task listener event'),
  class: z.string().optional(),
  expression: z.string().optional(),
  delegateExpression: z.string().optional(),
  script: z.object({ scriptFormat: z.string(), value: z.string() }).optional(),
});

export const setErrorEventDefinitionSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Event id (Start/End/Boundary/Intermediate)'),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  name: z.string().optional(),
  errorCodeVariable: z.string().optional(),
  errorMessageVariable: z.string().optional(),
});

export const setTimerEventDefinitionSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Event id'),
  kind: z.enum(['timeDuration', 'timeCycle', 'timeDate']),
  expression: z.string().describe('Timer expression (ISO 8601 or cron, etc.)'),
  language: z.string().optional(),
});

export const setMessageEventDefinitionSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Event id'),
  name: z.string().describe('Message name'),
});

export const setSignalEventDefinitionSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  elementId: z.string().describe('Event id'),
  name: z.string().describe('Signal name'),
});

export const setProcessAttributesSchema = z.object({
  diagramId: z.string().describe('Diagram session id'),
  id: z.string().optional().describe('New process id'),
  name: z.string().optional(),
  isExecutable: z.boolean().optional(),
  versionTag: z.string().optional(),
  historyTimeToLive: z.string().optional(),
  jobPriority: z.string().optional(),
  candidateStarterUsers: z.string().optional(),
  candidateStarterGroups: z.string().optional(),
  isStartableInTasklist: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type ToolShape = Record<string, z.ZodTypeAny>;

export interface ToolDefinition {
  name: string;
  description: string;
  /** Zod object holding the full schema (used for validation in handlers). */
  schema: z.ZodObject<ToolShape>;
  /** Raw shape — what the MCP SDK's `registerTool({ inputSchema })` expects. */
  shape: ToolShape;
}

function tool(name: string, description: string, schema: z.ZodObject<any>): ToolDefinition {
  return { name, description, schema, shape: schema.shape as ToolShape };
}

export const TOOLS: ToolDefinition[] = [];

const RAW_TOOLS: Array<{ name: string; description: string; schema: z.ZodObject<any> }> = [
  // Diagram lifecycle
  { name: 'create_diagram', description: 'Create a new empty BPMN diagram session.', schema: createDiagramSchema },
  { name: 'list_diagrams', description: 'List all open diagram sessions.', schema: listDiagramsSchema },
  { name: 'delete_diagram', description: 'Discard a diagram session.', schema: deleteDiagramSchema },
  { name: 'load_diagram_xml', description: 'Import a BPMN 2.0 XML string into a session.', schema: loadDiagramXmlSchema },
  { name: 'load_diagram_file', description: 'Import a .bpmn file from disk into a session.', schema: loadDiagramFileSchema },
  { name: 'get_diagram_xml', description: 'Serialize a session to BPMN 2.0 XML.', schema: getDiagramXmlSchema },
  { name: 'save_diagram', description: 'Write a session to a .bpmn file on disk.', schema: saveDiagramSchema },
  { name: 'auto_layout', description: 'Regenerate BPMN DI (BPMNDiagram/Shape/Edge) via bpmn-auto-layout.', schema: autoLayoutSchema },
  { name: 'validate_diagram', description: 'Run structural validation and return errors/warnings.', schema: validateDiagramSchema },

  // Element creation
  { name: 'add_start_event', description: 'Add a StartEvent (optionally typed message/timer/signal/error/conditional).', schema: addStartEventSchema },
  { name: 'add_end_event', description: 'Add an EndEvent (optionally typed message/signal/error/escalation/terminate).', schema: addEndEventSchema },
  { name: 'add_intermediate_event', description: 'Add an IntermediateCatch/ThrowEvent with optional event definition.', schema: addIntermediateEventSchema },
  { name: 'add_boundary_event', description: 'Attach a BoundaryEvent to an activity.', schema: addBoundaryEventSchema },
  { name: 'add_task', description: 'Add a Task (Task/UserTask/ServiceTask/SendTask/ReceiveTask/ScriptTask/BusinessRuleTask/ManualTask).', schema: addTaskSchema },
  { name: 'add_gateway', description: 'Add a Gateway (Exclusive/Parallel/Inclusive/EventBased/Complex).', schema: addGatewaySchema },
  { name: 'add_subprocess', description: 'Add a SubProcess (embedded/transaction/adhoc/event).', schema: addSubprocessSchema },
  { name: 'add_call_activity', description: 'Add a CallActivity referencing a called process.', schema: addCallActivitySchema },
  { name: 'add_text_annotation', description: 'Add a text annotation (use add_association to link it).', schema: addTextAnnotationSchema },

  { name: 'delete_element', description: 'Delete an element and its incident flows.', schema: deleteElementSchema },
  { name: 'list_elements', description: 'List elements in a diagram, optionally filtered.', schema: listElementsSchema },
  { name: 'get_element', description: 'Inspect an element including Camunda extensions.', schema: getElementSchema },
  { name: 'set_name', description: 'Set an element name.', schema: setNameSchema },
  { name: 'set_documentation', description: 'Set the bpmn:Documentation child of an element.', schema: setDocumentationSchema },

  // Flows
  { name: 'connect_elements', description: 'Create a SequenceFlow between two flow nodes.', schema: connectElementsSchema },
  { name: 'add_message_flow', description: 'Create a MessageFlow between two participants.', schema: addMessageFlowSchema },
  { name: 'add_association', description: 'Create an Association (e.g. text annotation link).', schema: addAssociationSchema },
  { name: 'set_default_flow', description: 'Mark a sequence flow as the default for its source gateway/activity.', schema: setDefaultFlowSchema },
  { name: 'set_condition_expression', description: 'Set a FormalExpression on an existing sequence flow.', schema: setConditionExpressionSchema },

  // Collaboration
  { name: 'add_participant', description: 'Create a Participant (pool). Promotes the diagram to a Collaboration.', schema: addParticipantSchema },
  { name: 'add_lane', description: 'Add a Lane to a Participant.', schema: addLaneSchema },
  { name: 'assign_to_lane', description: 'Add a flow node to a lane (flowNodeRef).', schema: assignToLaneSchema },

  // Camunda 7
  { name: 'set_task_implementation', description: 'Set Camunda 7 task implementation (class/expression/delegateExpression/external).', schema: setTaskImplementationSchema },
  { name: 'set_async', description: 'Set Camunda 7 async/exclusive flags on an activity.', schema: setAsyncSchema },
  { name: 'set_user_task_assignment', description: 'Set assignee, candidate users/groups, due/follow-up dates and priority on a UserTask.', schema: setUserTaskAssignmentSchema },
  { name: 'set_form', description: 'Set camunda:formKey/formRef or embedded camunda:FormData.', schema: setFormSchema },
  { name: 'set_io_mapping', description: 'Set camunda:InputOutput parameters on an element.', schema: setIoMappingSchema },
  { name: 'set_camunda_properties', description: 'Replace camunda:Properties on an element.', schema: setCamundaPropertiesSchema },
  { name: 'add_execution_listener', description: 'Append a camunda:ExecutionListener (start/end/take).', schema: addExecutionListenerSchema },
  { name: 'add_task_listener', description: 'Append a camunda:TaskListener (create/assignment/complete/delete/update/timeout) on a UserTask.', schema: addTaskListenerSchema },
  { name: 'set_error_event_definition', description: 'Configure a bpmn:ErrorEventDefinition incl. bpmn:Error reference and Camunda variable names.', schema: setErrorEventDefinitionSchema },
  { name: 'set_timer_event_definition', description: 'Configure a bpmn:TimerEventDefinition (timeDuration/timeCycle/timeDate FormalExpression).', schema: setTimerEventDefinitionSchema },
  { name: 'set_message_event_definition', description: 'Configure a bpmn:MessageEventDefinition (creates/reuses a bpmn:Message rootElement).', schema: setMessageEventDefinitionSchema },
  { name: 'set_signal_event_definition', description: 'Configure a bpmn:SignalEventDefinition (creates/reuses a bpmn:Signal rootElement).', schema: setSignalEventDefinitionSchema },
  { name: 'set_process_attributes', description: 'Set process-level attributes (id/name/isExecutable + Camunda 7 attributes).', schema: setProcessAttributesSchema },
];

for (const t of RAW_TOOLS) {
  TOOLS.push(tool(t.name, t.description, t.schema));
}
