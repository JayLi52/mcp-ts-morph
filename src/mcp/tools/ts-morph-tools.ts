import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerRenameSymbolTool } from "./register-rename-symbol-tool";
import { registerRenameFileSystemEntryTool } from "./register-rename-file-system-entry-tool";
import { registerFindReferencesTool } from "./register-find-references-tool";
import { registerRemovePathAliasTool } from "./register-remove-path-alias-tool";
import { registerMoveSymbolToFileTool } from "./register-move-symbol-to-file-tool";

/**
 * 将使用 ts-morph 的重构工具组注册到 MCP 服务器
 */
export function registerTsMorphTools(server: McpServer): void {
	registerRenameSymbolTool(server);
	registerRenameFileSystemEntryTool(server);
	registerFindReferencesTool(server);
	registerRemovePathAliasTool(server);
	registerMoveSymbolToFileTool(server);
}
