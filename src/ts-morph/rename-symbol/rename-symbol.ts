import { type Project, SyntaxKind, type Identifier, type Node } from "ts-morph";
// 导入通用函数
import {
	initializeProject,
	getChangedFiles,
	saveProjectChanges,
} from "../_utils/ts-morph-project";

// --- 辅助函数 ---

/**
 * 从指定文件与位置查找 Identifier 节点
 */
export function findIdentifierNode(
	project: Project,
	targetFilePath: string,
	position: { line: number; column: number },
): Identifier {
	const sourceFile = project.getSourceFile(targetFilePath);
	if (!sourceFile)
		throw new Error(`未找到文件: ${targetFilePath}`);

	let positionOffset: number;
	try {
		positionOffset = sourceFile.compilerNode.getPositionOfLineAndCharacter(
			position.line - 1,
			position.column - 1,
		);
	} catch (error) {
		throw new Error(
			`指定位置 (${position.line}:${position.column}) 超出文件范围或无效`,
		);
	}

	const node = sourceFile.getDescendantAtPos(positionOffset);

	if (!node) {
		throw new Error(
			`在指定位置 (${position.line}:${position.column}) 未找到节点`,
		);
	}

	const identifier = node.asKind(SyntaxKind.Identifier);

	if (
		identifier &&
		identifier.getStart() <= positionOffset &&
		positionOffset < identifier.getEnd()
	) {
		return identifier;
	}

	throw new Error(
		`指定位置 (${position.line}:${position.column}) 不是 Identifier`,
	);
}

/**
 * 验证 Identifier 节点是否为期望的符号名与类型（父节点类型）
 */
export function validateSymbol(
	identifier: Identifier,
	expectedSymbolName: string,
): void {
	if (identifier.getText() === expectedSymbolName) {
		return;
	}
	throw new Error(
		`符号名不匹配（期望: ${expectedSymbolName}, 实际: ${identifier.getText()}）`,
	);
}

/**
 * 获取指定 Identifier 节点的所有引用位置
 *（注意可能包含定义位置）
 * @param identifier 要搜索引用的 Identifier 节点
 * @returns 引用位置的 Node 数组
 */
export function findAllReferencesAsNodes(identifier: Identifier): Node[] {
	return identifier.findReferencesAsNodes();
}

/**
 * 在整个项目中重命名指定符号
 */
export async function renameSymbol({
	tsconfigPath,
	targetFilePath,
	position,
	symbolName,
	newName,
	dryRun = false,
}: {
	tsconfigPath: string;
	targetFilePath: string;
	position: { line: number; column: number };
	symbolName: string;
	newName: string;
	dryRun?: boolean;
}): Promise<{ changedFiles: string[] }> {
	const project = initializeProject(tsconfigPath);
	const identifierNode = findIdentifierNode(project, targetFilePath, position);
	validateSymbol(identifierNode, symbolName);
	identifierNode.rename(newName);

	const changedFiles = getChangedFiles(project);

	if (!dryRun) {
		await saveProjectChanges(project);
	}
	return { changedFiles: changedFiles.map((f) => f.getFilePath()) };
}
