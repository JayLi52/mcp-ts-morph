import type {
	SourceFile,
	ImportDeclaration,
	ExportDeclaration,
} from "ts-morph";
import type { DeclarationToUpdate } from "../types";
import { getTsConfigPaths } from "./ts-morph-project";
import logger from "../../utils/logger";

/**
 * 检查模块说明符是否使用了在 tsconfig 中定义的路径别名
 */
function checkIsPathAlias(
	specifier: string,
	tsConfigPaths?: Record<string, string[]>,
): boolean {
	if (!tsConfigPaths) {
		return false;
	}
	return Object.keys(tsConfigPaths).some((aliasKey) =>
		specifier.startsWith(aliasKey.replace(/\*$/, "")),
	);
}

/**
 * 查找引用目标文件的所有 Import/Export 声明。
 * 使用 ts-morph 的 getReferencingSourceFiles。
 * 注意：通过桶文件（例如：index.ts）进行再导出的引用可能无法找到。
 */
export async function findDeclarationsReferencingFile(
	targetFile: SourceFile,
	signal?: AbortSignal,
): Promise<DeclarationToUpdate[]> {
	signal?.throwIfAborted();
	const results: DeclarationToUpdate[] = [];
	const targetFilePath = targetFile.getFilePath();
	const project = targetFile.getProject();
	const tsConfigPaths = getTsConfigPaths(project);

	logger.trace(
		{ targetFile: targetFilePath },
		"Starting findDeclarationsReferencingFile using getReferencingSourceFiles",
	);

	// 使用 ts-morph 的内置方法查找引用源的源文件
	const referencingSourceFiles = targetFile.getReferencingSourceFiles();

	logger.trace(
		{ count: referencingSourceFiles.length },
		"Found referencing source files via ts-morph",
	);

	const uniqueDeclarations = new Set<ImportDeclaration | ExportDeclaration>();

	for (const referencingFile of referencingSourceFiles) {
		signal?.throwIfAborted();
		const referencingFilePath = referencingFile.getFilePath();
		try {
			const declarations = [
				...referencingFile.getImportDeclarations(),
				...referencingFile.getExportDeclarations(),
			];

			for (const declaration of declarations) {
				signal?.throwIfAborted();
				if (uniqueDeclarations.has(declaration)) continue;

				const moduleSpecifier = declaration.getModuleSpecifier();
				if (!moduleSpecifier) continue;

				// 确认声明是否确实解析到目标文件
				const specifierSourceFile = declaration.getModuleSpecifierSourceFile();

				if (specifierSourceFile?.getFilePath() === targetFilePath) {
					const originalSpecifierText = moduleSpecifier.getLiteralText();
					if (originalSpecifierText) {
						const wasPathAlias = checkIsPathAlias(
							originalSpecifierText,
							tsConfigPaths,
						);
						results.push({
							declaration,
							resolvedPath: targetFilePath,
							referencingFilePath: referencingFilePath,
							originalSpecifierText,
							wasPathAlias,
						});
						uniqueDeclarations.add(declaration);
						logger.trace(
							{
								referencingFile: referencingFilePath,
								specifier: originalSpecifierText,
								kind: declaration.getKindName(),
							},
							"Found relevant declaration",
						);
					}
				}
			}
		} catch (err) {
			logger.warn(
				{ file: referencingFilePath, err },
				"Error processing referencing file",
			);
		}
	}

	logger.trace(
		{ foundCount: results.length },
		"Finished findDeclarationsReferencingFile",
	);
	return results;
}
