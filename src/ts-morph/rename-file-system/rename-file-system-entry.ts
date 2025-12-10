import * as path from "node:path";
import { performance } from "node:perf_hooks";
import type { Project } from "ts-morph";
import logger from "../../utils/logger";
import {
	getChangedFiles,
	getTsConfigPaths,
	saveProjectChanges,
} from "../_utils/ts-morph-project";
import type {
	DeclarationToUpdate,
	PathMapping,
	RenameOperation,
} from "../types";
import { checkIsPathAlias } from "./_utils/check-is-path-alias";
import { findDeclarationsForRenameOperation } from "./_utils/find-declarations-for-rename-operation";
import { moveFileSystemEntries } from "./move-file-system-entries";
import { prepareRenames } from "./prepare-renames";
import { updateModuleSpecifiers } from "./update-module-specifiers";

/**
 * [実験的] 移動対象ファイルのエクスポートシンボルを参照するすべての宣言を特定し、
 * ユニークな DeclarationToUpdate のリストにして返す。
 */
async function findAllDeclarationsToUpdate(
	project: Project,
	renameOperations: RenameOperation[],
	signal?: AbortSignal,
): Promise<DeclarationToUpdate[]> {
	signal?.throwIfAborted();
	const startTime = performance.now();
	const allFoundDeclarationsMap = new Map<string, DeclarationToUpdate>();
	const tsConfigPaths = getTsConfigPaths(project);

	logger.debug(
		{
			count: renameOperations.length,
			paths: renameOperations.map((op) => op.oldPath),
		},
		"[实验性] 查找引用被重命名项导出符号的声明",
	);

	for (const renameOperation of renameOperations) {
		signal?.throwIfAborted();
		const { oldPath } = renameOperation;

		const declarationsFound = findDeclarationsForRenameOperation(
			renameOperation,
			signal,
		);

		for (const declaration of declarationsFound) {
			const referencingFilePath = declaration.getSourceFile().getFilePath();

			const mapKey = `${referencingFilePath}-${declaration.getPos()}-${declaration.getEnd()}`;
			if (allFoundDeclarationsMap.has(mapKey)) {
				continue;
			}

			const originalSpecifierText = declaration.getModuleSpecifierValue();
			if (!originalSpecifierText) continue;

			const wasPathAlias = checkIsPathAlias(
				originalSpecifierText,
				tsConfigPaths,
			);

			const importPath = declaration
				.getModuleSpecifierSourceFile()
				?.getFilePath();

			if (oldPath !== importPath) {
				// リネーム対象のファイルを直接インポートしていない（バレルファイル等で間接的にインポートしている）場合はスキップ
				continue;
			}

			allFoundDeclarationsMap.set(mapKey, {
				declaration,
				resolvedPath: oldPath,
				referencingFilePath,
				originalSpecifierText,
				wasPathAlias,
			});
		}
	}

	const uniqueDeclarationsToUpdate = Array.from(
		allFoundDeclarationsMap.values(),
	);

	if (logger.level === "debug" || logger.level === "trace") {
		const logData = uniqueDeclarationsToUpdate.map((decl) => ({
			referencingFile: decl.referencingFilePath,
			originalSpecifier: decl.originalSpecifierText,
			resolvedPath: decl.resolvedPath,
			kind: decl.declaration.getKindName(),
		}));
		const durationMs = (performance.now() - startTime).toFixed(2);
		logger.debug(
			{ declarationCount: uniqueDeclarationsToUpdate.length, durationMs },
			"[实验性] 基于符号的声明查找完成",
		);
		if (uniqueDeclarationsToUpdate.length > 0) {
			logger.trace(
				{ declarations: logData },
				"通过符号查找到的声明详情",
			);
		}
	}

	return uniqueDeclarationsToUpdate;
}

/**
 * 指定された複数のファイルまたはフォルダをリネームし、プロジェクト内の参照を更新する。
 *
 * @param project ts-morph プロジェクトインスタンス
 * @param renames リネーム対象のパスのペア ({ oldPath: string, newPath: string }) の配列
 * @param dryRun trueの場合、ファイルシステムへの変更を保存せずに、変更されるファイルのリストのみを返す
 * @param signal オプショナルな AbortSignal。処理をキャンセルするために使用できる
 * @returns 変更されたファイルの絶対パスのリスト
 * @throws リネーム処理中にエラーが発生した場合、または signal によってキャンセルされた場合
 */
export async function renameFileSystemEntry({
	project,
	renames,
	dryRun = false,
	signal,
}: {
	project: Project;
	renames: PathMapping[];
	dryRun?: boolean;
	signal?: AbortSignal;
}): Promise<{ changedFiles: string[] }> {
	const mainStartTime = performance.now();
	const logProps = {
		renames: renames.map((r) => ({
			old: path.basename(r.oldPath),
			new: path.basename(r.newPath),
		})),
		dryRun,
	};
	logger.info({ props: logProps }, "renameFileSystemEntry 开始执行");

	let changedFilePaths: string[] = [];
	let errorOccurred = false;
	let errorMessage = "";

	try {
		signal?.throwIfAborted();

		const renameOperations = prepareRenames(project, renames, signal);
		signal?.throwIfAborted();

		const allDeclarationsToUpdate = await findAllDeclarationsToUpdate(
			project,
			renameOperations,
			signal,
		);
		signal?.throwIfAborted();

		moveFileSystemEntries(renameOperations, signal);
		signal?.throwIfAborted();

		updateModuleSpecifiers(allDeclarationsToUpdate, renameOperations, signal);

		const saveStart = performance.now();
        const changed = getChangedFiles(project);
        changedFilePaths = changed.map((f) => f.getFilePath());
        // 当项目为内存文件系统（路径以 '/' 开头）时，保持 POSIX 形式；否则归一化为本地分隔符
        const usesPosix = changedFilePaths.some((p) => p.startsWith("/"));
        if (!usesPosix) {
            changedFilePaths = changedFilePaths.map((p) => path.normalize(p));
        }

		if (!dryRun && changed.length > 0) {
			signal?.throwIfAborted();
			await saveProjectChanges(project, signal);
			logger.debug(
				{
					count: changed.length,
					durationMs: (performance.now() - saveStart).toFixed(2),
				},
				"已保存项目变更",
			);
		} else if (dryRun) {
			logger.info({ count: changed.length }, "干跑：跳过保存");
		} else {
			logger.info("无可保存的变更");
		}
	} catch (error) {
		errorOccurred = true;
		errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(
			{ err: error, props: logProps },
			`重命名过程中出错: ${errorMessage}`,
		);
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
	} finally {
		const durationMs = (performance.now() - mainStartTime).toFixed(2);
		const status = errorOccurred ? "失败" : "成功";
		logger.info(
			{ status, durationMs, changedFileCount: changedFilePaths.length },
			"renameFileSystemEntry 执行完成",
		);
	}

	if (errorOccurred) {
		throw new Error(
			`重命名失败：${errorMessage}。请查看日志获取详情。`,
		);
	}

	return { changedFiles: changedFilePaths };
}
