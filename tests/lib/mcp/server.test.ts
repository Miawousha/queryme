import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "@/lib/mcp/server";

describe("buildMcpServer", () => {
  it("registers exactly the expected tools", async () => {
    const server = buildMcpServer("local-override");

    // The in-process protocol Server has no transport on its own, so connect a
    // linked InMemoryTransport pair and drive a `tools/list` request through a
    // real Client — this exercises the registered list-tools handler end to end.
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual(["ask", "forward_question"]);

    await client.close();
    await server.close();
  });
});
