import logger from "../../utils/logger";
import type { PathMapping, RenameOperation } from "../types";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import type { Project } from "ts-morph";

function checkDestinationExists(
	project: Project,
	pathToCheck: string,
	signal?: AbortSignal,
): void {
	signal?.throwIfAborted();
	if (project.getSourceFile(pathToCheck)) {
		throw new Error(`重命名目标路径已存在文件: ${pathToCheck}`);
	}
	if (project.getDirectory(pathToCheck)) {
		throw new Error(
			`重命名目标路径已存在目录: ${pathToCheck}`,
		);
	}
}

export function prepareRenames(
	project: Project,
	renames: PathMapping[],
	signal?: AbortSignal,
): RenameOperation[] {
	const startTime = performance.now();
	signal?.throwIfAborted();
	const renameOperations: RenameOperation[] = [];
	const uniqueNewPaths = new Set<string>();
	logger.debug({ count: renames.length }, "开始准备重命名操作");

	for (const rename of renames) {
		signal?.throwIfAborted();
		const logRename = { old: rename.oldPath, new: rename.newPath };
		logger.trace({ rename: logRename }, "处理中重命名请求");

		const absoluteOldPath = path.resolve(rename.oldPath);
		const absoluteNewPath = path.resolve(rename.newPath);

	if (uniqueNewPaths.has(absoluteNewPath)) {
		throw new Error(`重命名目标路径重复: ${absoluteNewPath}`);
	}
		uniqueNewPaths.add(absoluteNewPath);

		checkDestinationExists(project, absoluteNewPath, signal);

		signal?.throwIfAborted();
		const sourceFile = project.getSourceFile(absoluteOldPath);
		const directory = project.getDirectory(absoluteOldPath);

		if (sourceFile) {
			logger.trace({ path: absoluteOldPath }, "识别为文件重命名");
			renameOperations.push({
				sourceFile,
				oldPath: absoluteOldPath,
				newPath: absoluteNewPath,
			});
		} else if (directory) {
			logger.trace({ path: absoluteOldPath }, "识别为目录重命名");
			signal?.throwIfAborted();
			const filesInDir = directory.getDescendantSourceFiles();
			logger.trace(
				{ path: absoluteOldPath, count: filesInDir.length },
				"已找到目录中需要重命名的文件",
			);
			for (const sf of filesInDir) {
				const oldFilePath = sf.getFilePath();
				const relative = path.relative(absoluteOldPath, oldFilePath);
				const newFilePath = path.resolve(absoluteNewPath, relative);
				logger.trace(
					{ oldFile: oldFilePath, newFile: newFilePath },
					"将目录文件加入重命名操作",
				);
				renameOperations.push({
					sourceFile: sf,
					oldPath: oldFilePath,
					newPath: newFilePath,
				});
			}
	} else {
		throw new Error(`未找到重命名目标: ${absoluteOldPath}`);
	}
	}
	const durationMs = (performance.now() - startTime).toFixed(2);
	logger.debug(
		{ operationCount: renameOperations.length, durationMs },
		"重命名操作准备完成",
	);
	return renameOperations;
}
