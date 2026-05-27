#!/usr/bin/env node
/**
 * Sage Intacct MCP Server
 * Exposes Sage Intacct actions as MCP tools for Hermes Agent
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClientFromEnv } from './sage/client.js';

// Create MCP server instance
const server = new McpServer({
  name: 'sage-intacct',
  version: '1.0.0',
});

// Create Sage client (will be initialized on first use)
let sageClient: ReturnType<typeof createClientFromEnv> | null = null;

function getClient() {
  if (!sageClient) {
    sageClient = createClientFromEnv();
  }
  return sageClient;
}

// ============================================================================
// TEST TOOL: ping
// Simple tool to verify the MCP connection works
// ============================================================================
server.tool(
  'ping',
  'Test the MCP connection. Returns a simple response to verify the server is running.',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            status: 'ok',
            server: 'sage-intacct',
            timestamp: new Date().toISOString(),
            message: 'Sage Intacct MCP Server is running!',
          }, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// TEST TOOL: check_sage_connection
// Verifies we can connect to Sage Intacct
// ============================================================================
server.tool(
  'check_sage_connection',
  'Test the connection to Sage Intacct by creating a session.',
  {},
  async () => {
    try {
      const client = getClient();
      const session = await client.createSession();
      
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'connected',
              locationId: session.locationId ?? null,
              endpoint: session.endpoint,
              sessionCreated: session.createdAt.toISOString(),
              message: 'Successfully connected to Sage Intacct!',
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
              message: 'Failed to connect to Sage Intacct. Check your credentials.',
            }, null, 2),
          },
        ],
      };
    }
  }
);

// ============================================================================
// Start the server
// ============================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('Sage Intacct MCP Server running on stdio');
  console.error('Available tools: ping, check_sage_connection');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
