/**
 * Read/write BPMN 2.0 XML for a DiagramSession. Round-trip safe.
 */
import type { BpmnModdleInstance, ModdleElement } from './moddle.js';
import type { DiagramSession } from '../store.js';

export interface ToXmlOptions {
  /** Pretty-print output (default true). */
  format?: boolean;
  /** Emit the `<?xml ... ?>` preamble (default true). */
  preamble?: boolean;
}

export async function definitionsToXml(
  definitions: ModdleElement,
  moddle: BpmnModdleInstance,
  opts: ToXmlOptions = {},
): Promise<string> {
  const { xml } = await moddle.toXML(definitions, {
    format: opts.format ?? true,
    preamble: opts.preamble ?? true,
  });
  return xml;
}

export async function xmlToDefinitions(
  xml: string,
  moddle: BpmnModdleInstance,
): Promise<{ definitions: ModdleElement; warnings: unknown[] }> {
  const { rootElement, warnings } = await moddle.fromXML(xml, 'bpmn:Definitions');
  return { definitions: rootElement, warnings };
}

/**
 * Walks the moddle tree and indexes every element that has an `id` attribute.
 * Used to rebuild DiagramSession.byId after a fresh XML import.
 */
export function indexById(definitions: ModdleElement): Map<string, ModdleElement> {
  const byId = new Map<string, ModdleElement>();
  const seen = new WeakSet<object>();
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const anyNode = node as Record<string, unknown>;
    const id = anyNode['id'];
    if (typeof id === 'string') byId.set(id, anyNode);
    for (const key of Object.keys(anyNode)) {
      if (key === '$parent' || key === '$model') continue;
      const value = anyNode[key];
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else if (value && typeof value === 'object') {
        walk(value);
      }
    }
  }
  walk(definitions);
  return byId;
}

export async function sessionToXml(
  session: DiagramSession,
  moddle: BpmnModdleInstance,
  opts?: ToXmlOptions,
): Promise<string> {
  return definitionsToXml(session.definitions, moddle, opts);
}
