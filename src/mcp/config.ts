import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTsMorphTools } from "./tools/ts-morph-tools";

/** 创建 MCP 服务器 */
export function createMcpServer(): McpServer {
	const server = new McpServer({
		name: "mcp-ts-morph",
		version: "0.3.0",
		description:
			"用于让代理更精准开展工作的 ts-morph 重构工具集",
	});
	registerTsMorphTools(server);
	return server;
}
