import logger from "../../utils/logger";
import { calculateRelativePath } from "../_utils/calculate-relative-path";
import type { DeclarationToUpdate, RenameOperation } from "../types";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

function findNewPath(
	oldFilePath: string,
	renameOperations: RenameOperation[],
): string | undefined {
	const operation = renameOperations.find((op) => op.oldPath === oldFilePath);
	return operation?.newPath;
}

export function updateModuleSpecifiers(
	allDeclarationsToUpdate: DeclarationToUpdate[],
	renameOperations: RenameOperation[],
	signal?: AbortSignal,
) {
	signal?.throwIfAborted();
	const startTime = performance.now();
	const PRESERVE_EXTENSIONS = [".js", ".jsx", ".json", ".mjs", ".cjs"];
	logger.debug(
		{ count: allDeclarationsToUpdate.length },
		"Starting module specifier updates",
	);

	let updatedCount = 0;
	let skippedCount = 0;

	for (const {
		declaration,
		resolvedPath,
		referencingFilePath,
		originalSpecifierText,
		wasPathAlias,
	} of allDeclarationsToUpdate) {
		signal?.throwIfAborted();
		const moduleSpecifier = declaration.getModuleSpecifier();
		if (!moduleSpecifier) {
			skippedCount++;
			logger.trace(
				{ referencingFilePath, kind: declaration.getKindName() },
				"Skipping declaration with no module specifier",
			);
			continue;
		}

		const newReferencingFilePath =
			findNewPath(referencingFilePath, renameOperations) ?? referencingFilePath;
		const newResolvedPath = findNewPath(resolvedPath, renameOperations);

		if (!newResolvedPath) {
			skippedCount++;
			logger.warn(
				{ resolvedPath, referencingFilePath: newReferencingFilePath },
				"Could not determine new path for resolved path - Skipping update.",
			);
			continue;
		}

		// TODO: 使用 wasPathAlias 添加计算与保留别名路径的逻辑
		let newSpecifier: string;

		// 判断原始导入风格是否省略了 index
		// （例如：'./utils'、'../'、'@/'）
		// 注意：这是简单判断，复杂场景可能无法覆盖
		const wasIndexSimplified =
			/(\/|\/[^/.]+)$/.test(originalSpecifierText) ||
			!path.extname(originalSpecifierText);
		logger.trace(
			{ originalSpecifierText, wasIndexSimplified },
			"Checked original specifier for index simplification",
		);

		if (wasPathAlias) {
			// --- 保持路径别名的逻辑（暂定） ---
			// 目前使用 calculateRelativePath，未来将替换为别名计算
			// 需要 tsconfig 的 paths 与 baseUrl
			logger.warn(
				{
					refFile: newReferencingFilePath,
					newResolved: newResolvedPath,
					originalSpecifier: originalSpecifierText,
				},
				"Path alias preservation not fully implemented yet. Calculating relative path as fallback.",
			);
			// ★★★ 此处需要计算别名路径的逻辑 ★★★
			// 例：const newAliasPath = calculateAliasPath(project, newReferencingFilePath, newResolvedPath);
			// 暂时计算相对路径。根据原始风格设置 simplifyIndex。
			newSpecifier = calculateRelativePath(
				newReferencingFilePath,
				newResolvedPath,
				{
					removeExtensions: !PRESERVE_EXTENSIONS.includes(
						path.extname(originalSpecifierText),
					),
					simplifyIndex: wasIndexSimplified, // 与原始风格保持一致
				},
			);
		} else {
			// --- 相对路径等，非别名的情况 ---
			newSpecifier = calculateRelativePath(
				newReferencingFilePath,
				newResolvedPath,
				{
					removeExtensions: !PRESERVE_EXTENSIONS.includes(
						path.extname(originalSpecifierText),
					),
					simplifyIndex: wasIndexSimplified, // 与原始风格保持一致
				},
			);
		}

		try {
			// 设置计算得到的 newSpecifier
			declaration.setModuleSpecifier(newSpecifier);
			updatedCount++;
		} catch (err) {
			skippedCount++;
			logger.error(
				{
					err,
					refFile: newReferencingFilePath,
					newResolved: newResolvedPath,
					originalSpecifier: originalSpecifierText,
					wasPathAlias,
					newSpecifier, // newRelativePath から変更
				},
				"Error setting module specifier, skipping update",
			);
		}
	}

	const durationMs = (performance.now() - startTime).toFixed(2);
	logger.debug(
		{ updated: updatedCount, skipped: skippedCount, durationMs },
		"Finished module specifier updates",
	);
}
