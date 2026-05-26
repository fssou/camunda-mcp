/**
 * HTTP entry point — Streamable HTTP transport.
 *
 * Each MCP session receives its own McpServer + DiagramStore so that
 * multiple clients connected to the same container are fully isolated.
 *
 * Environment variables:
 *   MCP_HTTP_PORT  — listen port  (default 3000)
 *   MCP_HTTP_HOST  — bind address (default 0.0.0.0)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildServer } from './server.js';
import { name, version } from './version.js';

interface Session {
  transport: StreamableHTTPServerTransport;
  mcp: McpServer;
}

const sessions = new Map<string, Session>();

const PORT = parseInt(process.env['MCP_HTTP_PORT'] ?? '3000', 10);
const HOST = process.env['MCP_HTTP_HOST'] ?? '0.0.0.0';
const MCP_PATH = '/mcp';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonError(res: ServerResponse, status: number, code: number, message: string): void {
  const body = JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null });
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  const raw = await readBody(req);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    jsonError(res, 400, -32700, 'Parse error');
    return;
  }

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, body);
    return;
  }

  if (!sessionId && isInitializeRequest(body)) {
    const built = buildServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, mcp: built.mcp });
      },
    });

    await built.mcp.connect(transport);

    await transport.handleRequest(req, res, body);
    return;
  }

  jsonError(res, 400, -32000, 'Bad Request: No valid session ID provided');
}

async function handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    return;
  }
  jsonError(res, 400, -32000, 'Bad Request: No valid session ID provided');
}

async function handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    await session.transport.close();
    await session.mcp.close();
    sessions.delete(sessionId);
    return;
  }
  jsonError(res, 400, -32000, 'Bad Request: No valid session ID provided');
}

const httpServer = createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== MCP_PATH) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  try {
    switch (req.method) {
      case 'POST':
        await handlePost(req, res);
        break;
      case 'GET':
        await handleGet(req, res);
        break;
      case 'DELETE':
        await handleDelete(req, res);
        break;
      default:
        jsonError(res, 405, -32000, 'Method not allowed');
    }
  } catch (err) {
    if (!res.headersSent) {
      jsonError(res, 500, -32603, 'Internal server error');
    }
    process.stderr.write(`${name}: error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  }
});

httpServer.listen(PORT, HOST, () => {
  process.stderr.write(`${name} v${version} ready on http://${HOST}:${PORT}${MCP_PATH}\n`);
});

async function shutdown(): Promise<void> {
  for (const [id, session] of sessions) {
    await session.transport.close();
    await session.mcp.close();
    sessions.delete(id);
  }
  httpServer.close();
}

process.on('SIGINT', () => { void shutdown().then(() => process.exit(0)); });
process.on('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });
