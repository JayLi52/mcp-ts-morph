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

    // 根据提供的旧路径风格判断（以 '/' 开始表示内存文件系统 POSIX 风格）

    for (const rename of renames) {
        signal?.throwIfAborted();
        const logRename = { old: rename.oldPath, new: rename.newPath };
        logger.trace({ rename: logRename }, "处理中重命名请求");

        const isPosixProject = Boolean(project.getDirectory("/"));
        let oldPathUsed: string;
        let newPathUsed: string;
        let isPosixStyle: boolean;

        if (isPosixProject) {
            oldPathUsed = rename.oldPath.replace(/\\/g, "/");
            newPathUsed = rename.newPath.replace(/\\/g, "/");
            isPosixStyle = true;
        } else {
            const candidateOld =
                project.getSourceFile(rename.oldPath) || project.getDirectory(rename.oldPath)
                    ? rename.oldPath
                    : path.resolve(rename.oldPath);
            isPosixStyle = candidateOld.startsWith("/");
            oldPathUsed = candidateOld.replace(/\\/g, "/");
            newPathUsed = (isPosixStyle ? rename.newPath : path.resolve(rename.newPath)).replace(/\\/g, "/");
        }

        if (uniqueNewPaths.has(newPathUsed)) {
            throw new Error(`重命名目标路径重复: ${newPathUsed}`);
        }
        uniqueNewPaths.add(newPathUsed);

        checkDestinationExists(project, newPathUsed, signal);

        signal?.throwIfAborted();
        const sourceFile = project.getSourceFile(oldPathUsed);
        const directory = project.getDirectory(oldPathUsed);

        if (sourceFile) {
            logger.trace({ path: oldPathUsed }, "识别为文件重命名");
            renameOperations.push({
                sourceFile,
                oldPath: oldPathUsed,
                newPath: newPathUsed,
            });
        } else if (directory) {
            logger.trace({ path: oldPathUsed }, "识别为目录重命名");
            signal?.throwIfAborted();
            const filesInDir = directory.getDescendantSourceFiles();
            logger.trace(
                { path: oldPathUsed, count: filesInDir.length },
                "已找到目录中需要重命名的文件",
            );
            for (const sf of filesInDir) {
                const oldFilePath = sf.getFilePath();
                const relative = isPosixStyle
                    ? path.posix.relative(oldPathUsed, oldFilePath)
                    : path.relative(path.normalize(oldPathUsed), path.normalize(oldFilePath));
                const newFilePath = isPosixStyle
                    ? path.posix.resolve(newPathUsed, relative)
                    : path.resolve(newPathUsed, relative).replace(/\\/g, "/");
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
            throw new Error(`未找到重命名目标: ${oldPathUsed}`);
        }
    }
	const durationMs = (performance.now() - startTime).toFixed(2);
	logger.debug(
		{ operationCount: renameOperations.length, durationMs },
		"重命名操作准备完成",
	);
	return renameOperations;
}
