import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { removePathAlias } from "../../ts-morph/remove-path-alias/remove-path-alias";
import { Project } from "ts-morph";
import * as path from "node:path"; // path モジュールが必要
import { performance } from "node:perf_hooks";

export function registerRemovePathAliasTool(server: McpServer): void {
	server.tool(
		"remove_path_alias_by_tsmorph",
		`[使用 ts-morph] 将指定路径内 import/export 语句中的路径别名（如 '@/') 转换为相对路径。

基于 \`tsconfig.json\` 解析别名并计算相对路径。

## 用法

将 \`import Button from '@/components/Button'\` 转换为 \`import Button from '../../components/Button'\`，有助于提高可移植性或满足项目约定。

1. 指定项目 \`tsconfig.json\` 的**绝对路径**。
2. 指定需要移除路径别名的目标文件或目录的**绝对路径**。
3. 可选地使用 \`dryRun: true\` 预览变更而不修改文件。

## 参数

- tsconfigPath（string，必填）：项目 \`tsconfig.json\` 的绝对路径。**必须是绝对路径。**
- targetPath（string，必填）：待处理的文件或目录的绝对路径。**必须是绝对路径。**
- dryRun（boolean，可选）：为 true 时仅展示计划变更，不修改文件。默认 false。

## 结果

- 成功：返回已修改（或 dryRun 下计划修改）的文件路径列表。
- 失败：返回错误信息。`,
		{
			tsconfigPath: z
				.string()
				.describe("项目 tsconfig.json 的绝对路径。"),
			targetPath: z
				.string()
				.describe("目标文件或目录的绝对路径。"),
			dryRun: z
				.boolean()
				.optional()
				.default(false)
					.describe("为 true 时仅展示变更计划，不修改文件。"),
		},
		async (args) => {
			const startTime = performance.now();
			let message = "";
			let isError = false;
			let duration = "0.00";
			const project = new Project({
				tsConfigFilePath: args.tsconfigPath,
			});

			try {
				const { tsconfigPath, targetPath, dryRun } = args;
				const compilerOptions = project.compilerOptions.get();
				const tsconfigDir = path.dirname(tsconfigPath);
				const baseUrl = path.resolve(
					tsconfigDir,
					compilerOptions.baseUrl ?? ".",
				);
				const pathsOption = compilerOptions.paths ?? {};

				const result = await removePathAlias({
					project,
					targetPath,
					dryRun,
					baseUrl,
					paths: pathsOption,
				});

				if (!dryRun) {
					await project.save();
				}

				const changedFilesList =
					result.changedFiles.length > 0
						? result.changedFiles.join("\n - ")
						: "(无变更)";
				const actionVerb = dryRun ? "计划修改" : "已修改";
				message = `移除路径别名（${dryRun ? "干跑" : "执行"}）：在指定路径 '${targetPath}' 下，以下文件${actionVerb}:\n - ${changedFilesList}`;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				message = `移除路径别名过程中出错: ${errorMessage}`;
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
