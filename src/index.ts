#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

// Simple emoji icon as data URI (⭐ star emoji in SVG)
const ICON_DATA_URI = "data:image/svg+xml;base64," + Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="50" y="50" font-size="60" text-anchor="middle" dominant-baseline="central">⭐</text>
</svg>
`.trim()).toString('base64');

const ICON = {
  src: ICON_DATA_URI,
  mimeType: "image/svg+xml"
};

// Function to create a new server instance
const createServer = () => {
  const server = new Server(
    {
      name: "icon-test-server",
      version: "1.0.0",
      // Server-level icon metadata
      icons: [ICON],
      websiteUrl: "https://github.com/modelcontextprotocol/inspector/pull/778"
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Tool with icon
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "test_tool",
          description: "A test tool with an icon",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "A message to echo back",
              },
            },
            required: ["message"],
          },
          icons: [ICON],
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "test_tool") {
      const message = request.params.arguments?.message as string;
      return {
        content: [
          {
            type: "text",
            text: `Echo: ${message}`,
          },
        ],
      };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  // Resource with icon
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "test://resource/example",
          name: "Test Resource",
          description: "A test resource with an icon",
          mimeType: "text/plain",
          icons: [ICON],
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "test://resource/example") {
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "text/plain",
            text: "This is a test resource with an icon",
          },
        ],
      };
    }
    throw new Error(`Unknown resource: ${request.params.uri}`);
  });

  // Prompt with icon
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "test_prompt",
          description: "A test prompt with an icon",
          arguments: [
            {
              name: "topic",
              description: "The topic to ask about",
              required: true,
            },
          ],
          icons: [ICON],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === "test_prompt") {
      const topic = request.params.arguments?.topic as string;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Tell me about ${topic}`,
            },
          },
        ],
      };
    }
    throw new Error(`Unknown prompt: ${request.params.name}`);
  });

  return server;
};

// Start the HTTP server
async function main() {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(express.json());
  app.use(cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id']
  }));

  // Map to store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // MCP POST endpoint - handles all JSON-RPC requests
  app.post("/sse", async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.log(`POST /sse - Session ID: ${sessionId || 'none'}`);

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        console.log(`Reusing existing transport for session: ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request - create new transport
        console.log('Creating new transport for initialization request');

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`Session initialized with ID: ${sid}`);
            transports[sid] = transport;
          }
        });

        // Set up cleanup handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`Transport closed for session ${sid}`);
            delete transports[sid];
          }
        };

        // Connect the server to the transport
        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        // Invalid request
        console.error('Invalid request: no session ID and not an initialize request');
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
        return;
      }

      // Handle request with existing transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  // MCP GET endpoint - handles SSE streams for existing sessions
  app.get("/sse", async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.log(`GET /sse - Session ID: ${sessionId || 'none'}`);

    if (!sessionId || !transports[sessionId]) {
      console.error('Invalid or missing session ID for GET request');
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // MCP DELETE endpoint - handles session termination
  app.delete("/sse", async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.log(`DELETE /sse - Session ID: ${sessionId || 'none'}`);

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling session termination:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`Icon Test MCP Server running on http://localhost:${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/sse`);
  });

  server.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Handle server shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down server...");
    for (const sessionId in transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    console.log("Server shutdown complete");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
