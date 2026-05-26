/**
 * Discriminated unions of BPMN 2.0 element types supported by this MCP.
 * Mirrors the bpmn-moddle / bpmn-js naming.
 */

export const TASK_TYPES = [
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ServiceTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:ManualTask',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const GATEWAY_TYPES = [
  'bpmn:ExclusiveGateway',
  'bpmn:ParallelGateway',
  'bpmn:InclusiveGateway',
  'bpmn:EventBasedGateway',
  'bpmn:ComplexGateway',
] as const;
export type GatewayType = (typeof GATEWAY_TYPES)[number];

export const EVENT_DEFINITION_TYPES = [
  'bpmn:MessageEventDefinition',
  'bpmn:TimerEventDefinition',
  'bpmn:SignalEventDefinition',
  'bpmn:ErrorEventDefinition',
  'bpmn:EscalationEventDefinition',
  'bpmn:ConditionalEventDefinition',
  'bpmn:LinkEventDefinition',
  'bpmn:CompensateEventDefinition',
  'bpmn:TerminateEventDefinition',
  'bpmn:CancelEventDefinition',
] as const;
export type EventDefinitionType = (typeof EVENT_DEFINITION_TYPES)[number];

export const SUBPROCESS_TYPES = ['bpmn:SubProcess', 'bpmn:Transaction', 'bpmn:AdHocSubProcess'] as const;
export type SubProcessType = (typeof SUBPROCESS_TYPES)[number];

export const INTERMEDIATE_EVENT_TYPES = ['bpmn:IntermediateCatchEvent', 'bpmn:IntermediateThrowEvent'] as const;
export type IntermediateEventType = (typeof INTERMEDIATE_EVENT_TYPES)[number];

export type AnyFlowNodeType =
  | 'bpmn:StartEvent'
  | 'bpmn:EndEvent'
  | IntermediateEventType
  | 'bpmn:BoundaryEvent'
  | TaskType
  | GatewayType
  | SubProcessType
  | 'bpmn:CallActivity';

export const FLOW_NODE_TYPES: AnyFlowNodeType[] = [
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:IntermediateCatchEvent',
  'bpmn:IntermediateThrowEvent',
  'bpmn:BoundaryEvent',
  ...TASK_TYPES,
  ...GATEWAY_TYPES,
  ...SUBPROCESS_TYPES,
  'bpmn:CallActivity',
];
