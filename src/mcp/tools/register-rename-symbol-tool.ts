import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { renameSymbol } from "../../ts-morph/rename-symbol/rename-symbol";
import { performance } from "node:perf_hooks";

export function registerRenameSymbolTool(server: McpServer): void {
	server.tool(
		"rename_symbol_by_tsmorph",
		`[使用 ts-morph] 在整个项目中重命名 TypeScript/JavaScript 符号。

通过 AST（抽象语法树）分析跟踪并更新引用，不仅限于定义处。适用于跨文件的重构任务。

## 用法

例如，当你在某个文件中更改函数名，并希望其他导入并使用它的文件也随之更新时，使用此工具。ts-morph 将基于 \`tsconfig.json\` 解析项目以解析符号引用并执行重命名。

1. 指定要重命名的符号的精确位置（文件路径、行、列），如函数名、变量名、类名等，以便定位 AST 中的目标 Identifier 节点。
2. 指定当前符号名与新的符号名。
3. 建议先使用 \`dryRun: true\` 预览会被修改的文件。
4. 如果预览正确，使用 \`dryRun: false\`（或省略）以实际写入文件系统。

## 参数

- tsconfigPath（string，必填）：项目根 \`tsconfig.json\` 的路径。用于正确解析项目结构与文件引用。**必须是绝对路径（相对路径可能被误解）。**
- targetFilePath（string，必填）：包含待重命名符号的文件路径（或首次出现位置）。**必须是绝对路径。**
- position（object，必填）：待重命名符号的精确位置，是 ts-morph 定位 AST 节点的起点。
  - line（number，必填）：从 1 开始的行号。
  - column（number，必填）：从 1 开始的列号（符号名首字符位置）。
- symbolName（string，必填）：重命名前的符号名，用于与指定位置处的节点名称进行校验。
- newName（string，必填）：重命名后的符号名。
- dryRun（boolean，可选）：若为 true，不写入文件，仅返回受影响的文件列表，便于校验。默认 false。

## 结果

- 成功：返回被修改的文件路径列表（若为 dryRun，则为预期修改列表）。
- 失败：返回错误信息。`,
		{
			tsconfigPath: z
				.string()
				.describe("项目 tsconfig.json 的路径。"),
			targetFilePath: z
				.string()
				.describe("包含待重命名符号的文件路径。"),
			position: z
				.object({
					line: z.number().describe("从 1 开始的行号。"),
					column: z.number().describe("从 1 开始的列号。"),
				})
				.describe("待重命名符号的精确位置。"),
				symbolName: z.string().describe("当前符号名。"),
				newName: z.string().describe("新的符号名。"),
			dryRun: z
				.boolean()
				.optional()
				.default(false)
					.describe("为 true 时仅预览变更，不修改文件。"),
		},
		async (args) => {
			const startTime = performance.now();
			let message = "";
			let isError = false;
			let duration = "0.00";

			try {
				const {
					tsconfigPath,
					targetFilePath,
					position,
					symbolName,
					newName,
					dryRun,
				} = args;
				const result = await renameSymbol({
					tsconfigPath: tsconfigPath,
					targetFilePath: targetFilePath,
					position: position,
					symbolName: symbolName,
					newName: newName,
					dryRun: dryRun,
				});

				const changedFilesList =
					result.changedFiles.length > 0
						? result.changedFiles.join("\n - ")
						: "(无变更)";

				if (dryRun) {
					message = `干跑完成：将符号 '${symbolName}' 重命名为 '${newName}' 会修改以下文件:\n - ${changedFilesList}`;
				} else {
					message = `重命名成功：已将符号 '${symbolName}' 重命名为 '${newName}'。已修改以下文件:\n - ${changedFilesList}`;
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				message = `重命名过程中出错: ${errorMessage}`;
				isError = true;
			} finally {
				const endTime = performance.now();
				duration = ((endTime - startTime) / 1000).toFixed(2);
			}

			const finalMessage = `${message}\n状态: ${
				isError ? "失败" : "成功"
			}\n处理耗时: ${duration} 秒`;

			return {
				content: [{ type: "text", text: finalMessage }],
				isError: isError,
			};
		},
	);
}
