import logger from "../../utils/logger";
import type { RenameOperation } from "../types";
import { performance } from "node:perf_hooks";
import * as path from "node:path";

export function moveFileSystemEntries(
	renameOperations: RenameOperation[],
	signal?: AbortSignal,
) {
	const startTime = performance.now();
	signal?.throwIfAborted();
	logger.debug(
		{ count: renameOperations.length },
		"Starting file system moves",
	);
    for (const { sourceFile, newPath, oldPath } of renameOperations) {
        signal?.throwIfAborted();
        logger.trace({ from: oldPath, to: newPath }, "Moving file");
        try {
            const fromDir = path.dirname(oldPath);
            const moveTarget = path.isAbsolute(newPath)
                ? path.relative(fromDir, newPath)
                : newPath;
            sourceFile.move(moveTarget);
        } catch (err) {
            logger.error(
                { err, from: oldPath, to: newPath },
                "Error during sourceFile.move()",
            );
            throw err;
        }
    }
	const durationMs = (performance.now() - startTime).toFixed(2);
	logger.debug({ durationMs }, "Finished file system moves");
}
