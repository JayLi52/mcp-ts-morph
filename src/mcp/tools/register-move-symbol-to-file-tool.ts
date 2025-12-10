import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { moveSymbolToFile } from "../../ts-morph/move-symbol-to-file/move-symbol-to-file";
import { initializeProject } from "../../ts-morph/_utils/ts-morph-project";
import { getChangedFiles } from "../../ts-morph/_utils/ts-morph-project";
import { SyntaxKind } from "ts-morph";
import { performance } from "node:perf_hooks";
import logger from "../../utils/logger";
import * as path from "node:path";

const syntaxKindMapping: { [key: string]: SyntaxKind } = {
	FunctionDeclaration: SyntaxKind.FunctionDeclaration,
	VariableStatement: SyntaxKind.VariableStatement,
	ClassDeclaration: SyntaxKind.ClassDeclaration,
	InterfaceDeclaration: SyntaxKind.InterfaceDeclaration,
	TypeAliasDeclaration: SyntaxKind.TypeAliasDeclaration,
	EnumDeclaration: SyntaxKind.EnumDeclaration,
};
const moveSymbolSchema = z.object({
	tsconfigPath: z
		.string()
		.describe(
			"项目 tsconfig.json 的绝对路径（ts-morph 解析所需）",
		),
	originalFilePath: z
		.string()
		.describe("包含待移动符号的文件的绝对路径。"),
	targetFilePath: z
		.string()
		.describe(
			"目标文件的绝对路径。可为已存在文件；若路径不存在将创建新文件。",
		),
	symbolToMove: z.string().describe("要移动的符号名称。"),
	declarationKindString: z
		.string()
		.optional()
		.describe(
			"可选。声明类型字符串（如 'VariableStatement'、'FunctionDeclaration' 等），用于同名符号时消除歧义。",
		),
	dryRun: z
		.boolean()
		.optional()
		.default(false)
		.describe("为 true 时仅预览变更，不修改文件。"),
});

type MoveSymbolArgs = z.infer<typeof moveSymbolSchema>;

/**
 * MCPサーバーに 'move_symbol_to_file_by_tsmorph' ツールを登録します。
 * このツールは、指定されたシンボルをファイル間で移動し、関連する参照を更新します。
 *
 * @param server McpServer インスタンス
 */
export function registerMoveSymbolToFileTool(server: McpServer): void {
	server.tool(
		"move_symbol_to_file",
		`将指定符号（函数、变量、类等）及其仅内部使用的依赖移动到新文件，并自动更新项目中的所有引用。适用于文件拆分和提升模块化的重构任务。

通过 AST 分析识别符号的使用位置，并基于新文件位置修正 import/export 路径；同时移动该符号仅内部使用的依赖。

## 用法

适用于以下代码重组场景：

1. **移动某个函数/类/变量：** 将逻辑移动到更合适的文件（如将通用 \`utils.ts\` 中的工具函数移动到特性文件 \`feature-utils.ts\`）。**本工具会移动指定符号及其仅内部使用的依赖。**
2. **抽取/移动相关逻辑（文件拆分/重组）：** 拆分大文件或重组逻辑时，将相关函数、类、类型或变量逐个移动到**另一个文件（新建或已有）**。**需为每个顶级符号单独运行本工具。**
3. **提升模块化：** 将相关功能聚合到更聚焦的文件中。**为每个需要移动的符号分别运行本工具。**

ts-morph 会基于 \`tsconfig.json\` 解析并安全地执行移动，自动更新 import/export。

## 参数

- tsconfigPath（string，必填）：项目根 \`tsconfig.json\` 的绝对路径。
- originalFilePath（string，必填）：当前包含待移动符号的文件的绝对路径。
- targetFilePath（string，必填）：目标文件的绝对路径；可为已存在文件；若路径不存在将创建新文件。
- symbolToMove（string，必填）：本次要移动的**单个顶级符号**的名称。
- declarationKindString（string，可选）：声明类型字符串（如 \'VariableStatement\'、\'FunctionDeclaration\'），用于在同名符号情况下消除歧义。
- dryRun（boolean，可选）：为 true 时仅预览变更，不修改文件。默认 false。

## 结果

- 成功：返回确认移动及引用更新的消息，并包含修改文件列表（或 dryRun 下将被修改的文件列表）。
- 失败：返回错误信息（如符号未找到、默认导出限制、AST 操作错误等）。

## 说明

- **每次执行移动一个顶级符号：** 本工具设计为每次移动一个指定的顶级符号（及其仅内部使用的依赖）。若需移动多个相关顶级符号（例如为文件拆分移动多组函数与类型），请对每个符号分别执行本工具。
- **无法移动默认导出。**
- **内部依赖处理：** 仅由该符号使用的依赖（函数、变量、类型等）会一同移动；其余在原文件仍被其他符号使用的依赖将保留，并在需要时添加 \`export\`，由新文件进行导入。与被移动符号无关的符号保持不变，除非在后续单独移动。
- **性能：** 在大型项目或引用较多的符号上移动可能耗时。`,
		moveSymbolSchema.extend({
			symbolToMove: z
				.string()
				.describe("本次执行要移动的单个顶级符号的名称。"),
			}).shape,
		async (args: MoveSymbolArgs) => {
			const startTime = performance.now();
			let message = "";
			let isError = false;
			let changedFilesCount = 0;
			let changedFiles: string[] = [];
			const {
				tsconfigPath,
				originalFilePath,
				targetFilePath,
				symbolToMove,
				declarationKindString,
				dryRun,
			} = args;

			const declarationKind: SyntaxKind | undefined =
				declarationKindString && syntaxKindMapping[declarationKindString]
					? syntaxKindMapping[declarationKindString]
					: undefined;

			if (declarationKindString && declarationKind === undefined) {
				logger.warn(
					`提供的 declarationKindString 无效: '${declarationKindString}'。将不指定类型继续执行。`,
				);
			}

			const logArgs = {
				tsconfigPath,
				originalFilePath: path.basename(originalFilePath),
				targetFilePath: path.basename(targetFilePath),
				symbolToMove,
				declarationKindString,
				dryRun,
			};

			try {
				const project = initializeProject(tsconfigPath);
				await moveSymbolToFile(
					project,
					originalFilePath,
					targetFilePath,
					symbolToMove,
					declarationKind,
				);

				changedFiles = getChangedFiles(project).map((sf) => sf.getFilePath());
				changedFilesCount = changedFiles.length;

				const baseMessage = `已将符号 \"${symbolToMove}\" 从 ${originalFilePath} 移动到 ${targetFilePath}。`;
				const changedFilesList =
					changedFiles.length > 0 ? changedFiles.join("\n - ") : "(No changes)";

				if (dryRun) {
					message = `干跑：${baseMessage}\n将被修改的文件：\n - ${changedFilesList}`;
					logger.info({ changedFiles }, "干跑：跳过保存。");
				} else {
					await project.save();
					logger.debug("移动符号后已保存项目变更。");
					message = `${baseMessage}\n以下文件已被修改：\n - ${changedFilesList}`;
				}
				isError = false;
			} catch (error) {
				logger.error(
					{ err: error, toolArgs: logArgs },
					"执行 move_symbol_to_file_by_tsmorph 时出错",
				);
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				message = `移动符号时出错: ${errorMessage}`;
				isError = true;
			} finally {
				const endTime = performance.now();
				const durationMs = endTime - startTime;

				logger.info(
					{
						status: isError ? "失败" : "成功",
						durationMs: Number.parseFloat(durationMs.toFixed(2)),
						changedFilesCount,
						dryRun,
					},
					"move_symbol_to_file_by_tsmorph 工具执行完成",
				);
				try {
					logger.flush();
				} catch (flushErr) {
					console.error("刷新日志失败:", flushErr);
				}
			}

			const endTime = performance.now();
			const durationMs = endTime - startTime;
			const durationSec = (durationMs / 1000).toFixed(2);
			const finalMessage = `${message}\n状态: ${isError ? "失败" : "成功"}\n处理耗时: ${durationSec} 秒`;

			return {
				content: [{ type: "text", text: finalMessage }],
				isError: isError,
			};
		},
	);
}
