import type { Node, SourceFile } from "ts-morph";
import { initializeProject } from "./_utils/ts-morph-project";
import { findIdentifierNode } from "./rename-symbol/rename-symbol";

// --- 结果的数据结构 ---

export interface ReferenceLocation {
	filePath: string;
	line: number;
	column: number;
	text: string;
}

// --- 主函数 ---

/**
 * 在整个项目中查找指定位置的符号的所有引用位置
 */
export async function findSymbolReferences({
	tsconfigPath,
	targetFilePath,
	position,
}: {
	tsconfigPath: string;
	targetFilePath: string;
	position: { line: number; column: number };
}): Promise<{
	references: ReferenceLocation[];
	definition: ReferenceLocation | null;
}> {
	const project = initializeProject(tsconfigPath);

	// 假定 targetFilePath 为绝对路径
	const identifierNode = findIdentifierNode(project, targetFilePath, position);

	// findReferencesAsNodes() 有时不包含定义位置
	const referenceNodes: Node[] = identifierNode.findReferencesAsNodes();

	let definitionLocation: ReferenceLocation | null = null;
	const definitions = identifierNode.getDefinitionNodes();
	if (definitions.length > 0) {
		const defNode = definitions[0];
		const defSourceFile = defNode.getSourceFile();
		const defStartPos = defNode.getStart();
		const { line: defLine, column: defColumn } =
			defSourceFile.getLineAndColumnAtPos(defStartPos);
		const lineText = getLineText(defSourceFile, defLine);
		definitionLocation = {
			filePath: defSourceFile.getFilePath(),
			line: defLine,
			column: defColumn,
			text: lineText.trim(),
		};
	}

	const references: ReferenceLocation[] = [];
	for (const refNode of referenceNodes) {
		const refSourceFile = refNode.getSourceFile();
		const refStartPos = refNode.getStart();
		const { line: refLine, column: refColumn } =
			refSourceFile.getLineAndColumnAtPos(refStartPos);

		if (
			definitionLocation &&
			refLine !== undefined &&
			refColumn !== undefined &&
			refSourceFile.getFilePath() === definitionLocation.filePath &&
			refLine === definitionLocation.line &&
			refColumn === definitionLocation.column
		) {
			continue; // 若与定义位置相同则跳过
		}

		if (refLine === undefined || refColumn === undefined) continue;

		const filePath = refSourceFile.getFilePath();
		const lineText = getLineText(refSourceFile, refLine);

		references.push({
			filePath,
			line: refLine,
			column: refColumn,
			text: lineText.trim(),
		});
	}

	references.sort((a, b) => {
		if (a.filePath !== b.filePath) {
			return a.filePath.localeCompare(b.filePath);
		}
		return a.line - b.line;
	});

	return { references, definition: definitionLocation };
}

function getLineText(sourceFile: SourceFile, lineNumber: number): string {
	// 获取文件全文文本，按行分割并返回对应行
	const lines = sourceFile.getFullText().split(/\r?\n/);
	// lineNumber 为 1 基，索引为 lineNumber - 1
	if (lineNumber > 0 && lineNumber <= lines.length) {
		return lines[lineNumber - 1];
	}
	// 找不到对应行时，是抛错还是返回空字符串取决于约定
	// 这里更自然的做法是抛出错误
	throw new Error(
		`Line ${lineNumber} not found in file ${sourceFile.getFilePath()}`,
	);
}
