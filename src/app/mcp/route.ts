import { mcpHandler } from "@/lib/mcp";

// Stateless Streamable HTTP MCP endpoint. No auth; nothing stored.
const handle = (req: Request) => mcpHandler.fetch(req);
export { handle as GET, handle as POST, handle as DELETE };
