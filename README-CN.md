**项目概览**
- 这是一个基于 `ts-morph` 的 MCP（Model Context Protocol）服务器，向 MCP 客户端（如 Cursor）提供 TypeScript/JavaScript 的重构与代码分析工具。
- 通过标准输入/输出传输运行，入口命令为 `dist/index.js`，包名为 `@sirosuzume/mcp-tsmorph-refactor`。
- 服务器标识与元数据在 `src/mcp/config.ts:7-11` 中声明：`name: "mcp-ts-morph"`、`version: "0.2.9"`、`description`。

**提供的工具**
- `rename_symbol_by_tsmorph`：跨项目重命名符号，自动更新所有引用（`src/mcp/tools/register-rename-symbol-tool.ts:7-13`）。
- `rename_filesystem_entry_by_tsmorph`：批量重命名文件或文件夹，并更新所有 import/export 路径（`src/mcp/tools/register-rename-file-system-entry-tool.ts:48-52`）。
- `find_references_by_tsmorph`：查找某位置符号的定义与所有引用（`src/mcp/tools/register-find-references-tool.ts:7-12`）。
- `remove_path_alias_by_tsmorph`：移除路径别名（如 `@/`），转换为相对路径（`src/mcp/tools/register-remove-path-alias-tool.ts:9-12`）。
- `move_symbol_to_file_by_tsmorph`：将指定顶层符号及其仅内部依赖迁移到新文件，并更新全项目引用（`src/mcp/tools/register-move-symbol-to-file-tool.ts:56-61`）。
- 所有工具统一在 `src/mcp/tools/ts-morph-tools.ts:12-17` 中注册。

**安装与使用**
- 作为 npm 包使用（推荐终端用户）：
  - 在 `mcp.json` 配置一个 MCP 服务器，命令使用 `npx` 加载包的可执行入口。
  - 示例：`README.md:57-67`。
- 本地开发运行（面向开发者）：
  - 安装依赖与构建：`pnpm install`、`pnpm run build`（`package.json:19-23`）。
  - 在 `mcp.json` 中将 `command` 设为 `node`，`args` 指向本地 `dist/index.js`（`README.md:81-97`）。

**运行方式**
- 可执行入口：`src/index.ts:1-7`（shebang、调用 `runStdioServer()`）。
- 传输层：`src/mcp/stdio.ts:4-7` 使用 `StdioServerTransport` 建立 stdio 连接。
- 服务器创建与工具注册：`src/mcp/config.ts:5-13`。

**主要文件**
- `src/index.ts`：进程入口，启动 MCP 服务器（`src/index.ts:1-7`）。
- `src/mcp/config.ts`：构建 MCP 服务器并注册工具（`src/mcp/config.ts:5-13`）。
- `src/mcp/stdio.ts`：标准 I/O 传输启动逻辑（`src/mcp/stdio.ts:4-7`）。
- `src/mcp/tools/ts-morph-tools.ts`：汇总注册所有 ts-morph 工具（`src/mcp/tools/ts-morph-tools.ts:12-17`）。
- 每个工具的注册与参数校验文件：
  - 重命名符号：`src/mcp/tools/register-rename-symbol-tool.ts`（`server.tool(...)` 定义于 `:7-13`）。
  - 重命名文件系统项：`src/mcp/tools/register-rename-file-system-entry-tool.ts`（参数模式与详细说明见 `:10-43,48-86`）。
  - 查找引用：`src/mcp/tools/register-find-references-tool.ts`（参数模式与输出见 `:6-12,33-47,95-103`）。
  - 移除路径别名：`src/mcp/tools/register-remove-path-alias-tool.ts`（参数模式见 `:33-47`）。
  - 移动符号到文件：`src/mcp/tools/register-move-symbol-to-file-tool.ts`（参数模式与限制说明见 `:19-45,72-91`）。

**工具用法与参数要点**
- 所有工具均依赖项目的 `tsconfig.json` 路径（通常要求绝对路径）。
- 大多数工具支持 `dryRun` 预览更改，不直接写入文件，便于安全验证。
- 关键参数示例：
  - 重命名符号：`tsconfigPath`、`targetFilePath`、`position{line,column}`、`symbolName`、`newName`、`dryRun`（`src/mcp/tools/register-rename-symbol-tool.ts:34-51,58-79`）。
  - 重命名文件/文件夹：`tsconfigPath`、`renames[{oldPath,newPath}]`、`dryRun`、`timeoutSeconds`（`src/mcp/tools/register-rename-file-system-entry-tool.ts:10-43`）。
  - 查找引用：`tsconfigPath`、`targetFilePath`、`position{line,column}`（`src/mcp/tools/register-find-references-tool.ts:21-28,33-46`）。
  - 移除路径别名：`tsconfigPath`、`targetPath`、`dryRun`（`src/mcp/tools/register-remove-path-alias-tool.ts:23-31,33-47`）。
  - 符号迁移：`tsconfigPath`、`originalFilePath`、`targetFilePath`、`symbolToMove`、`declarationKindString?`、`dryRun`（`src/mcp/tools/register-move-symbol-to-file-tool.ts:19-45,72-80`）。

**日志配置**
- 使用 `pino`；支持环境变量控制级别与输出位置（`src/utils/logger.ts:12-23,31-41`）。
- 环境变量解析与默认值：`NODE_ENV`、`LOG_LEVEL`、`LOG_OUTPUT`、`LOG_FILE_PATH`（`src/utils/logger-helpers.ts:6-20,31-56`）。
- 文件日志会确保目录存在；开发环境可使用 `pino-pretty` 美化控制台输出（`src/utils/logger-helpers.ts:66-96,106-132,143-153`）。
- 在 `mcp.json` 的 `env` 中配置日志，参考 `README.md:99-124`。

**脚本与依赖**
- 构建与入口：`main: "dist/index.js"`, `bin: { "mcp-tsmorph-refactor": "dist/index.js" }`（`package.json:5-8`）。
- 核心命令：`pnpm build`、`pnpm test`、`pnpm check-types`、`pnpm lint`、`pnpm format`（`package.json:19-31`）。
- 依赖：`@modelcontextprotocol/sdk`、`ts-morph`、`typescript`、`zod`、`pino`（`package.json:48-54`）。
- 包管理器与版本约束：`packageManager: pnpm@10.10.0`、`volta.node: 20.19.0`（`package.json:17,35-37`）。

**典型使用场景**
- 大型项目或多文件重构：批量重命名文件/目录并自动修正 import/export（`rename_filesystem_entry_by_tsmorph`）。
- 跨文件符号名重构：统一更新所有引用（`rename_symbol_by_tsmorph`）。
- 重构前影响面分析：定位定义与所有引用（`find_references_by_tsmorph`）。
- 目录别名清理与可移植性提升：移除 `@/` 等别名为相对路径（`remove_path_alias_by_tsmorph`）。
- 渐进式文件拆分：按符号迁移并维护依赖与引用（`move_symbol_to_file_by_tsmorph`）。

**限制与注意**
- `rename_filesystem_entry_by_tsmorph` 对 `export default Identifier` 的默认导出更新存在已知限制（`src/mcp/tools/register-rename-file-system-entry-tool.ts:83-86`）。
- `move_symbol_to_file_by_tsmorph` 一次仅移动一个顶层符号；默认导出不可移动（`src/mcp/tools/register-move-symbol-to-file-tool.ts:88-91`）。
- 大型项目操作可能耗时较长，请优先使用 `dryRun` 预览。

**参考代码位置**
- 服务器配置与注册：`src/mcp/config.ts:5-13`、`src/mcp/tools/ts-morph-tools.ts:12-17`
- 传输与入口：`src/mcp/stdio.ts:4-7`、`src/index.ts:1-7`
- 工具注册点：  
  - 符号重命名：`src/mcp/tools/register-rename-symbol-tool.ts:7-13`  
  - 文件/目录重命名：`src/mcp/tools/register-rename-file-system-entry-tool.ts:48-52`  
  - 查找引用：`src/mcp/tools/register-find-references-tool.ts:7-12`  
  - 移除路径别名：`src/mcp/tools/register-remove-path-alias-tool.ts:9-12`  
  - 符号迁移到文件：`src/mcp/tools/register-move-symbol-to-file-tool.ts:56-61`  
- 包信息与脚本：`package.json:1-8,17-31,48-54`
- 使用说明与示例：`README.md:51-124,176-213`