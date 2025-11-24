# MCP Icon Test Server

This is a **streamable HTTP/SSE** MCP server created to test icon support for PR #778 in the MCP Inspector.

## Features

This server demonstrates icon metadata for all supported MCP types:

- **Server Implementation**: The server itself has an icon (⭐)
- **Tools**: `test_tool` - A simple echo tool with an icon
- **Resources**: `test://resource/example` - A test resource with an icon
- **Prompts**: `test_prompt` - A test prompt with an icon

All icons use the same emoji data URI (star emoji) for testing purposes.

## Installation

```bash
npm install
npm run build
```

## Running the Server

### Development mode (with TypeScript):
```bash
npm run dev
```
The server will start on `http://localhost:3001`

### Production mode (compiled):
```bash
npm start
```

### Custom port:
```bash
PORT=8080 npm run dev
```

## Endpoints

- **SSE Endpoint**: `http://localhost:3001/sse` - MCP communication endpoint
- **Health Check**: `http://localhost:3001/health` - Server health status
- **Message Endpoint**: `http://localhost:3001/message` - Client message POST endpoint

## Testing with MCP Inspector

To test this server with the MCP Inspector from PR #778:

1. Start this server: `npm run dev`
2. In the MCP Inspector, add an HTTP server connection using:
   ```
   http://localhost:3001/sse
   ```

## Testing Icon Support

Once connected to the Inspector, you should see icons displayed for:

1. The server itself (in the server list/header)
2. The `test_tool` tool (in the tools list)
3. The `test://resource/example` resource (in the resources list)
4. The `test_prompt` prompt (in the prompts list)

## Icon Format

Icons follow the SEP-973 specification with the following structure:

```typescript
{
  src: string,        // Data URI or HTTP(S) URL
  mimeType: string,   // MIME type (e.g., "image/svg+xml")
  sizes: string[]     // Array of sizes (e.g., ["any", "48x48"])
}
```

This server uses a simple SVG data URI with a star emoji (⭐) for all icons.

## Testing Different Icon Types

You can modify `src/index.ts` to test different icon formats:

- **Different emoji**: Change the emoji character in the SVG
- **PNG data URI**: Use a base64-encoded PNG instead
- **HTTP URL**: Point to an actual image URL
- **Multiple sizes**: Provide multiple icon objects in the `icons` array

## Server Capabilities

### Tools
- `test_tool`: Echoes back a message

### Resources
- `test://resource/example`: Returns a simple text resource

### Prompts
- `test_prompt`: Creates a prompt asking about a topic
