#!/usr/bin/env node
import { runStdioServer } from "./mcp/stdio";

// 启动服务器
runStdioServer().catch((error: Error) => {
	process.stderr.write(JSON.stringify({ error: `Fatal error: ${error}` }));
	process.exit(1);
});
