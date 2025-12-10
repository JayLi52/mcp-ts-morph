import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findSymbolReferences } from "../../ts-morph/find-references"; // 导入新的函数与类型
import { performance } from "node:perf_hooks";

export function registerFindReferencesTool(server: McpServer): void {
	server.tool(
		"find_references_by_tsmorph",
		`[使用 ts-morph] 在整个项目中查找给定位置的符号定义及其所有引用。

基于 \`tsconfig.json\` 解析项目，定位该符号（函数、变量、类等）的定义位置及所有使用位置。

## 用法

在重构前使用本工具以评估更改某个符号的影响，帮助识别函数调用点、变量使用点等。

1. 指定项目 \`tsconfig.json\` 的**绝对路径**。
2. 指定包含目标符号的文件的**绝对路径**。
3. 指定该符号在文件内的**精确位置**（行、列）。

## 参数

- tsconfigPath（string，必填）：项目根 \`tsconfig.json\` 的绝对路径。用于 ts-morph 正确解析项目。**必须是绝对路径。**
- targetFilePath（string，必填）：包含待查询符号的文件的绝对路径。**必须是绝对路径。**
- position（object，必填）：待查询符号在文件中的精确位置。
  - line（number，必填）：从 1 开始的行号。
  - column（number，必填）：从 1 开始的列号。

## 结果

- 成功：返回定义位置（如存在）和引用位置列表（文件路径、行号、列号、该行文本）。
- 失败：返回错误信息。`,
		{
			tsconfigPath: z
				.string()
				.describe("项目 tsconfig.json 的绝对路径。"),
			targetFilePath: z
				.string()
				.describe("包含目标符号的文件的绝对路径。"),
			position: z
				.object({
					line: z.number().describe("从 1 开始的行号。"),
					column: z.number().describe("从 1 开始的列号。"),
				})
				.describe("符号在文件中的精确位置。"),
		},
		async (args) => {
			const startTime = performance.now();
			let message = "";
			let isError = false;
			let duration = "0.00"; // duration を外で宣言・初期化

			try {
				const { tsconfigPath, targetFilePath, position } = args;
				const { references, definition } = await findSymbolReferences({
					tsconfigPath: tsconfigPath,
					targetFilePath: targetFilePath,
					position,
				});

				let resultText = "";

                if (definition) {
                    resultText += "Definition: 定义：\n";
					resultText += `- ${definition.filePath}:${definition.line}:${definition.column}\n`;
					resultText += `  \`\`\`typescript\n  ${definition.text}\n  \`\`\`\n\n`;
				} else {
					resultText += "未找到定义。\n\n";
				}

                if (references.length > 0) {
                    resultText += `References (${references.length} found): 引用（找到 ${references.length} 处）：\n`;
					const formattedReferences = references
						.map(
							(ref) =>
								`- ${ref.filePath}:${ref.line}:${ref.column}\n  \`\`\`typescript\n  ${ref.text}\n  \`\`\`\``,
						)
						.join("\n\n");
					resultText += formattedReferences;
				} else {
					resultText += "未找到引用。";
				}
				message = resultText.trim();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				message = `查找引用时出错: ${errorMessage}`;
				isError = true;
			} finally {
				const endTime = performance.now();
				duration = ((endTime - startTime) / 1000).toFixed(2); // duration を更新
			}

			// finally の外で return する
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
