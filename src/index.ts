/**
 * stdio entry point. Spawn this from any MCP client (Claude Desktop, Cursor,
 * Continue, etc.) using:
 *
 *   { "command": "node", "args": ["/abs/path/to/dist/index.js"] }
 *
 * The server logs to stderr only — stdout is reserved for the MCP transport.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';
import { name, version } from './version.js';

async function main(): Promise<void> {
  const { mcp } = buildServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  process.stderr.write(`${name} v${version} ready on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(`${name}: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
