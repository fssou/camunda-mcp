/**
 * Wrapper around bpmn-auto-layout. Takes a BPMN XML string (no DI required)
 * and returns a XML string with a freshly-generated bpmndi:BPMNDiagram.
 *
 * The layouter does NOT mutate the underlying process model; it just adds DI
 * shapes/edges/waypoints.
 */
import { layoutProcess } from 'bpmn-auto-layout';
import type { DiagramSession } from '../store.js';
import type { BpmnModdleInstance } from './moddle.js';
import { definitionsToXml, xmlToDefinitions } from './xml.js';
import { indexById } from './xml.js';

export async function autoLayoutXml(xml: string): Promise<string> {
  return layoutProcess(xml);
}

/**
 * Convenience: round-trip the session through bpmn-auto-layout and replace
 * its definitions in-place. Returns the new XML so the caller can echo it.
 */
export async function autoLayoutSession(session: DiagramSession, moddle: BpmnModdleInstance): Promise<string> {
  const xmlIn = await definitionsToXml(session.definitions, moddle, { format: true, preamble: true });
  const xmlOut = await autoLayoutXml(xmlIn);
  const { definitions } = await xmlToDefinitions(xmlOut, moddle);
  session.definitions = definitions;
  session.byId = indexById(definitions);
  return xmlOut;
}
