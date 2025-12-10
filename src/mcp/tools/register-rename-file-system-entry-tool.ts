import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { renameFileSystemEntry } from "../../ts-morph/rename-file-system/rename-file-system-entry";
import { initializeProject } from "../../ts-morph/_utils/ts-morph-project";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { TimeoutError } from "../../errors/timeout-error";
import logger from "../../utils/logger";

const renameSchema = z.object({
	tsconfigPath: z
		.string()
				.describe("项目 tsconfig.json 的绝对路径。"),
	renames: z
		.array(
			z.object({
				oldPath: z
					.string()
					.describe("待重命名的文件或文件夹的当前绝对路径。"),
				newPath: z
					.string()
					.describe("期望的新绝对路径。"),
			}),
		)
		.nonempty()
				.describe("重命名操作数组，每项包含 oldPath 与 newPath。"),
	dryRun: z
		.boolean()
		.optional()
		.default(false)
				.describe("为 true 时仅预览变更，不修改文件。"),
	timeoutSeconds: z
		.number()
		.int()
		.positive()
		.optional()
		.default(120)
				.describe("操作允许的最大秒数，超过则超时。默认 120。"),
});

type RenameArgs = z.infer<typeof renameSchema>;

export function registerRenameFileSystemEntryTool(server: McpServer): void {
	server.tool(
		"rename_filesystem_entry",
		`重命名**一个或多个** TypeScript/JavaScript 文件**和/或文件夹**，并在整个项目中更新所有引用它们的 import/export 路径。

基于 \`tsconfig.json\` 解析项目，定位被重命名项的所有引用并自动修正路径。**支持相对路径、路径别名（例如 @/）、以及引用目录 index.ts 的导入（\`from '.'\` 或 \`from '..'\`）。** 在应用更改前会进行冲突检查。

## 用法

当需要同时重命名/移动多个文件或文件夹（例如将 \`util.ts\` 重命名为 \`helper.ts\`，并在一次操作中将 \`src/data\` 移动到 \`src/coreData\`）并希望所有相关 \`import\`/\`export\` 语句自动更新时，使用此工具。

1. 指定项目 \`tsconfig.json\` 的路径。**必须是绝对路径。**
2. 提供重命名操作数组。数组中的每个对象包含：
    - \`oldPath\`：待重命名的文件或文件夹的**绝对路径**。
    - \`newPath\`：期望的新**绝对路径**。
3. 建议先使用 \`dryRun: true\` 预览受影响的文件。
4. 预览正确后使用 \`dryRun: false\`（或省略）实际写入文件系统。

## 参数

- tsconfigPath（string，必填）：项目根 \`tsconfig.json\` 的绝对路径。**必须是绝对路径。**
- renames（对象数组，必填）：每个对象描述一次重命名操作：
    - oldPath（string，必填）：当前文件或文件夹的绝对路径。**必须是绝对路径。**
    - newPath（string，必填）：新的绝对路径。**必须是绝对路径。**
- dryRun（boolean，可选）：为 true 时不写入文件，仅返回受影响文件列表。默认 false。
- timeoutSeconds（number，可选）：操作允许的最大秒数，超过将超时。默认 120 秒。

## 结果

- 成功：返回已修改或计划修改的文件路径列表。
- 失败：返回错误信息（例如路径冲突、文件不存在、超时）。

## 说明
- **基于符号的引用查找：** 主要通过符号分析（识别导出的函数、类、变量等）跨项目查找引用，而非仅依赖路径匹配。
- **路径别名处理：** import/export 中的路径别名（例如 \`@/\`）会被更新，但会**转换为相对路径**。若需保留别名，建议在重命名前先使用 \`remove_path_alias_by_tsmorph\` 进行预转换。
- **index 文件导入：** 引用目录 \`index.ts\` 或 \`index.tsx\` 的导入（例如 \`import Component from '../components'\`）将更新为具体的 index 文件路径（例如 \`import Component from '../components/index.tsx'\`）。
- **已知限制（默认导出）：** 目前可能无法正确更新使用标识符的默认导出（例如 \`export default MyIdentifier;\`），函数或类声明式默认导出通常可处理。
- **性能：** 在大型项目或一次重命名众多文件/文件夹时，符号分析与更新可能耗时较长。
- **冲突：** 在应用更改前会检查冲突（例如重命名到已存在的路径、目标重复）。
- **超时：** 超过 \`timeoutSeconds\` 的操作会被取消。`,
		renameSchema.shape,
		async (args: RenameArgs) => {
			const startTime = performance.now();
			let message = "";
			let isError = false;
			let changedFilesCount = 0;
			const { tsconfigPath, renames, dryRun, timeoutSeconds } = args;
			const TIMEOUT_MS = timeoutSeconds * 1000;

			let resultPayload: {
				content: { type: "text"; text: string }[];
				isError: boolean;
			} = {
					content: [{ type: "text", text: "发生了未预期的错误。" }],
				isError: true,
			};

			const controller = new AbortController();
			let timeoutId: NodeJS.Timeout | undefined = undefined;
			const logArgs = {
				tsconfigPath,
				renames: renames.map((r) => ({
					old: path.basename(r.oldPath),
					new: path.basename(r.newPath),
				})),
				dryRun,
				timeoutSeconds,
			};

			try {
				timeoutId = setTimeout(() => {
					const errorMessage = `操作在 ${timeoutSeconds} 秒内未完成，已超时`;
					logger.error(
						{ toolArgs: logArgs, durationSeconds: timeoutSeconds },
						errorMessage,
					);
					controller.abort(new TimeoutError(errorMessage, timeoutSeconds));
				}, TIMEOUT_MS);

				const project = initializeProject(tsconfigPath);
				const result = await renameFileSystemEntry({
					project,
					renames,
					dryRun,
					signal: controller.signal,
				});

				changedFilesCount = result.changedFiles.length;

				const changedFilesList =
					result.changedFiles.length > 0
						? result.changedFiles.join("\n - ")
						: "(无变更)";
					const renameSummary = renames
						.map(
							(r) =>
								`'${path.basename(r.oldPath)}' -> '${path.basename(r.newPath)}'`,
						)
						.join(", ");

				if (dryRun) {
					message = `干跑完成：重命名 [${renameSummary}] 将会修改以下文件：\n - ${changedFilesList}`;
				} else {
					message = `重命名成功：已重命名 [${renameSummary}]。以下文件已被修改：\n - ${changedFilesList}`;
				}
				isError = false;
			} catch (error) {
				logger.error(
					{ err: error, toolArgs: logArgs },
					"执行 rename_filesystem_entry_by_tsmorph 时出错",
				);

                if (error instanceof TimeoutError) {
                    message = `Error: 操作未在 ${error.durationSeconds} 秒内完成，已超时并取消。\n项目规模较大或修改点过多。`;
                } else if (error instanceof Error && error.name === "AbortError") {
                    message = `Error: 操作已取消: ${error.message}`;
                } else {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    message = `Error: 重命名过程中出错: ${errorMessage}`;
                }
				isError = true;
			} finally {
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				const endTime = performance.now();
				const durationMs = endTime - startTime;

				logger.info(
					{
						status: isError ? "Failure" : "Success",
						durationMs: Number.parseFloat(durationMs.toFixed(2)),
						changedFilesCount,
						dryRun,
					},
					"rename_filesystem_entry_by_tsmorph 工具执行完成",
				);
				try {
					logger.flush();
					logger.trace("工具执行后日志已刷新。");
				} catch (flushErr) {
					console.error("刷新日志失败:", flushErr);
				}
			}

			const endTime = performance.now();
			const durationMs = endTime - startTime;
			const durationSec = (durationMs / 1000).toFixed(2);
			const finalMessage = `${message}\n状态: ${isError ? "失败" : "成功"}\n处理耗时: ${durationSec} 秒`;
			resultPayload = {
				content: [{ type: "text", text: finalMessage }],
				isError: isError,
			};

			return resultPayload;
		},
	);
}
