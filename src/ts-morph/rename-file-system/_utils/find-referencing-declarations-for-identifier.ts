import {
	type ExportDeclaration,
	type Identifier,
	type ImportDeclaration,
	SyntaxKind,
} from "ts-morph";
import logger from "../../../utils/logger";

export function findReferencingDeclarationsForIdentifier(
	identifierNode: Identifier,
	signal?: AbortSignal,
): Set<ImportDeclaration | ExportDeclaration> {
	const referencingDeclarations = new Set<
		ImportDeclaration | ExportDeclaration
	>();

	logger.trace(
		{ identifierText: identifierNode.getText() },
		"查找该标识符的引用",
	);

	const references = identifierNode.findReferencesAsNodes();

	for (const referenceNode of references) {
		signal?.throwIfAborted();

		const importOrExportDecl =
			referenceNode.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ??
			referenceNode.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);

		if (importOrExportDecl?.getModuleSpecifier()) {
			referencingDeclarations.add(importOrExportDecl);
		}
	}
	logger.trace(
		{
			identifierText: identifierNode.getText(),
			count: referencingDeclarations.size,
		},
		"已找到该标识符的引用声明",
	);
	return referencingDeclarations;
}
