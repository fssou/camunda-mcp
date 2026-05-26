/**
 * Ambient module declarations for upstream packages that ship no types.
 * Kept minimal — we only annotate the surface this MCP actually touches.
 */

declare module 'bpmn-moddle' {
  type ModdleElement = any;

  interface FromXmlResult {
    rootElement: ModdleElement;
    elementsById: Record<string, ModdleElement>;
    references: unknown[];
    warnings: unknown[];
  }

  interface ToXmlResult {
    xml: string;
  }

  interface ToXmlOptions {
    format?: boolean;
    preamble?: boolean;
  }

  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>, config?: Record<string, unknown>);
    create<T = ModdleElement>(type: string, properties?: Record<string, unknown>): T;
    fromXML(xml: string, typeName?: string, options?: Record<string, unknown>): Promise<FromXmlResult>;
    toXML(element: ModdleElement, options?: ToXmlOptions): Promise<ToXmlResult>;
  }
}

declare module 'bpmn-auto-layout' {
  /** Receives a BPMN 2.0 XML string and returns one with regenerated DI. */
  export function layoutProcess(xml: string): Promise<string>;
}
