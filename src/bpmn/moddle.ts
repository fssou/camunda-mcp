/**
 * Creates a bpmn-moddle instance preloaded with the Camunda 7 extension
 * descriptor (namespace http://camunda.org/schema/1.0/bpmn, prefix `camunda`).
 *
 * The camunda-bpmn-moddle package only ships a JSON descriptor; we pass it
 * directly to BpmnModdle as a package definition.
 */
import { BpmnModdle } from 'bpmn-moddle';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const camundaModdle = require('camunda-bpmn-moddle/resources/camunda.json') as Record<string, unknown>;

export type ModdleElement = any;
export type BpmnModdleInstance = InstanceType<typeof BpmnModdle>;

export function createModdle(): BpmnModdleInstance {
  return new BpmnModdle({ camunda: camundaModdle });
}
