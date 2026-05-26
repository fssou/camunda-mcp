/**
 * In-memory diagram store. Each MCP server process holds a map of diagram
 * sessions keyed by `diagramId`. Sessions live for the duration of the
 * MCP server process; use `save_diagram` to persist to a `.bpmn` file.
 */
import type { BpmnModdleInstance, ModdleElement } from './bpmn/moddle.js';
import { createModdle } from './bpmn/moddle.js';
import { indexById, xmlToDefinitions } from './bpmn/xml.js';

export interface DiagramSession {
  id: string;
  /** Convenience reference to the bpmn:Process child of definitions. */
  processId: string;
  /** Convenience reference to the bpmn:Collaboration child (if any). */
  collaborationId?: string;
  /** Optional file path the session was loaded from / last saved to. */
  filePath?: string;
  /** The root bpmn:Definitions moddle element. */
  definitions: ModdleElement;
  /** O(1) id → moddle element map; rebuilt on every load/import. */
  byId: Map<string, ModdleElement>;
}

export interface CreateDiagramOptions {
  name?: string;
  processId?: string;
  isExecutable?: boolean;
  targetNamespace?: string;
}

let counter = 0;
function nextDiagramId(): string {
  counter += 1;
  return `diagram_${Date.now().toString(36)}_${counter}`;
}

/** Locates the first child of `definitions.rootElements` that matches `type`. */
function findRootElement(definitions: ModdleElement, type: string): ModdleElement | undefined {
  const roots: ModdleElement[] = definitions.rootElements ?? [];
  return roots.find((r) => r?.$type === type);
}

export class DiagramStore {
  private sessions = new Map<string, DiagramSession>();
  private moddle: BpmnModdleInstance;

  constructor(moddle?: BpmnModdleInstance) {
    this.moddle = moddle ?? createModdle();
  }

  getModdle(): BpmnModdleInstance {
    return this.moddle;
  }

  list(): DiagramSession[] {
    return Array.from(this.sessions.values());
  }

  get(id: string): DiagramSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Diagram "${id}" not found. Known ids: ${[...this.sessions.keys()].join(', ') || '(none)'}`);
    return session;
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Creates a fresh empty diagram with a single bpmn:Process and no DI.
   * Use auto_layout to generate BPMNDI later.
   */
  create(opts: CreateDiagramOptions = {}): DiagramSession {
    const processId = opts.processId ?? `Process_${shortId()}`;
    const process = this.moddle.create('bpmn:Process', {
      id: processId,
      name: opts.name,
      isExecutable: opts.isExecutable ?? true,
      flowElements: [],
    });
    const definitions = this.moddle.create('bpmn:Definitions', {
      id: `Definitions_${shortId()}`,
      targetNamespace: opts.targetNamespace ?? 'http://bpmn.io/schema/bpmn',
      exporter: 'camunda-mcp',
      exporterVersion: '0.1.0',
      rootElements: [process],
    });
    // moddle emits xmlns declarations for registered packages on demand;
    // we don't need to pre-populate $attrs.
    process.$parent = definitions;

    const id = nextDiagramId();
    const session: DiagramSession = {
      id,
      processId,
      definitions,
      byId: new Map([
        [definitions.id, definitions],
        [process.id, process],
      ]),
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * Loads a session from a BPMN XML string. If `id` is provided and matches an
   * existing session, it is replaced; otherwise a new id is allocated.
   */
  async loadXml(xml: string, id?: string): Promise<DiagramSession> {
    const { definitions } = await xmlToDefinitions(xml, this.moddle);
    const process = findRootElement(definitions, 'bpmn:Process');
    if (!process) throw new Error('XML does not contain a bpmn:Process root element');
    const collaboration = findRootElement(definitions, 'bpmn:Collaboration');
    const sessionId = id ?? nextDiagramId();
    const session: DiagramSession = {
      id: sessionId,
      processId: process.id,
      collaborationId: collaboration?.id,
      definitions,
      byId: indexById(definitions),
    };
    this.sessions.set(sessionId, session);
    return session;
  }
}

/**
 * Compact random id suffix; mirrors bpmn-js id generator style well enough for
 * human-readable diagrams without needing the full ids-generator package.
 */
function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export { shortId };
