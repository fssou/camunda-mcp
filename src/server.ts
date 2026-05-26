/**
 * Builds the McpServer instance and registers every tool from the registry.
 *
 * Kept transport-agnostic so the same factory can be wired to stdio in
 * `src/index.ts` or to an HTTP transport in tests/integrations.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DiagramStore } from './store.js';
import { Handlers } from './tools/handlers.js';
import { TOOLS } from './tools/registry.js';
import { version as pkgVersion, name as pkgName } from './version.js';

export interface BuildServerOptions {
  store?: DiagramStore;
}

export interface BuiltServer {
  mcp: McpServer;
  store: DiagramStore;
  handlers: Handlers;
}

export function buildServer(opts: BuildServerOptions = {}): BuiltServer {
  const store = opts.store ?? new DiagramStore();
  const handlers = new Handlers(store);
  const mcp = new McpServer({
    name: pkgName,
    version: pkgVersion,
  });

  for (const def of TOOLS) {
    mcp.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.shape,
      },
      async (args: unknown) => {
        const result = await handlers.dispatch(def.name, args);
        return {
          content: result.content,
          isError: result.isError,
        };
      },
    );
  }

  return { mcp, store, handlers };
}
