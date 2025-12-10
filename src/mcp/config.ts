import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTsMorphTools } from "./tools/ts-morph-tools";

/**
 * 概述
 *
 * 该文件用于集中定义 MCP 服务器的基础配置（名称、版本、描述），并注册一组基于 ts-morph 的重构工具。
 * 在大型 TypeScript 项目中，可通过 MCP 宿主环境（如 CLI、服务进程或 IDE 扩展）加载本服务器，统一对外暴露
 * 重命名符号、重命名/移动文件系统项、路径别名转换、符号搬迁、查找引用等能力。
 *
 * 使用示例（示意）
 * 1) 标准输入/输出模式启动：
 * ```ts
 * import { runStdioServer } from "./mcp/stdio";
 * await runStdioServer();
 * ```
 *
 * 2) 在应用/测试中创建服务器并通过宿主调用工具：
 * ```ts
 * import { createMcpServer } from "./mcp/config";
 * const server = createMcpServer();
 * // 由所在宿主环境触发工具调用（示意，实际 API 由宿主实现）：
 * // host.callTool("rename_symbol_by_tsmorph", { ...参数 });
 * // host.callTool("rename_filesystem_entry_by_tsmorph", { ...参数 });
 * // host.callTool("remove_path_alias_by_tsmorph", { ...参数 });
 * // host.callTool("move_symbol_to_file_by_tsmorph", { ...参数 });
 * // host.callTool("find_references_by_tsmorph", { ...参数 });
 * ```
 *
 * 3) 扩展或修改配置：覆盖名称/版本/描述，或注册自定义工具：
 * ```ts
 * import { createMcpServer } from "./mcp/config";
 * const server = createMcpServer({
 *   name: "acme-mcp-refactor",
 *   version: "1.0.0",
 *   description: "企业内部 TypeScript 重构工具集",
 *   register: (srv) => {
 *     // 在此注册企业特定工具（示意）
 *     // srv.tool("my_tool", "说明", schema, async (args) => {
 *     //   // 具体实现略
 *     // });
 *   },
 * });
 * ```
 *
 * 4) 不同重构上下文中的应用（建议流程）：
 * - 跨模块重命名符号：先使用 dryRun 预览影响范围，确认后再写入
 * - 批量重命名/移动文件与目录：一次性更新所有引用的 import/export 路径
 * - 将顶级符号移动到新文件：自动调整 import/export，保持引用一致性
 * - 路径别名规范化：将别名转换为相对路径，提升可移植性与发布稳定性
 *
 * 维护与更新最佳实践
 * - 优先使用绝对路径参数（如 tsconfigPath、文件路径）以避免解析差异
 * - 默认先使用 dryRun 审查预计变更，减少不可逆修改风险
 * - 自定义工具的注册建议封装为独立函数，便于复用与测试
 * - 版本与描述应与功能演进保持同步，便于审计与协作
 * - 严禁在配置中引入敏感信息（密钥、凭证等），遵循安全规范
 *
 * 常见用例
 * - 大型单体仓库的模块重组与分层改造
 * - 从通用工具文件抽取函数至特性模块以提升内聚
 * - 清理或统一 import/export 路径风格，减少技术债
 * - 将路径别名替换为相对路径以便发布、迁移或跨环境运行
 */

export interface CreateMcpServerOptions {
    name?: string;
    version?: string;
    description?: string;
    register?: (server: McpServer) => void;
}

/**
 * 创建并返回一个已注册 ts-morph 重构工具组的 MCP 服务器。
 * 可通过 options 覆盖基础元数据并注册额外工具。
 *
 * 参数：
 * - options.name/version/description：覆盖服务器元信息（可选）
 * - options.register：在回调中注册额外工具（可选）
 *
 * 返回：
 * - McpServer 实例，可在宿主环境中连接并使用
 */
export function createMcpServer(options: CreateMcpServerOptions = {}): McpServer {
    const server = new McpServer({
        name: options.name ?? "mcp-ts-morph",
        version: options.version ?? "0.3.0",
        description:
            options.description ?? "用于让代理更精准开展工作的 ts-morph 重构工具集",
    });
    registerTsMorphTools(server);
    options.register?.(server);
    return server;
}
