# Querying queryme over MCP

queryme exposes a Streamable-HTTP Model Context Protocol endpoint so other
agents can ask about Alexandre directly — no scraping, no copy-pasting.

## Endpoint

    https://<your-deploy>/api/mcp

The endpoint speaks the standard MCP Streamable-HTTP transport. Sessions are
short-lived; pass the `conversationId` returned from your first `ask` call into
subsequent calls if you want a continuous thread.

## Tools

- `ask` — Ask a question. Returns text + a conversationId.
- `forward_question` — Leave a question for Alexandre to answer later. Returns the queued id.

## Connector configurations

### Claude Desktop

Add to `claude_desktop_config.json`:

    {
      "mcpServers": {
        "queryme": {
          "command": "npx",
          "args": ["-y", "mcp-remote", "https://<your-deploy>/api/mcp"]
        }
      }
    }

### Cursor, Windsurf, and other JSON-config clients

Same `mcpServers` block as Claude Desktop. Drop it into the client's MCP
settings file.

### Direct HTTP (curl)

A minimal `ask` invocation, for debugging:

    curl -N -X POST https://<your-deploy>/api/mcp \
      -H 'content-type: application/json' \
      -H 'accept: text/event-stream' \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ask","arguments":{"question":"What is Alexandre most known for?"}}}'

## Rate limits

The MCP endpoint shares the same per-IP rate limit as the public chat: 30
requests / 10 minutes. Exceeded calls return an MCP error with code 429.
