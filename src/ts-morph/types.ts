import type {
	SourceFile,
	ImportDeclaration,
	ExportDeclaration,
	Statement,
} from "ts-morph";

export type PathMapping = {
	oldPath: string;
	newPath: string;
};

/**
 * 表示文件或文件夹重命名操作的对象。
 * @property sourceFile - 对应的 SourceFile 实例（文件时）
 * @property oldPath - 重命名前的绝对路径
 * @property newPath - 重命名后的绝对路径
 */
export type RenameOperation = {
	sourceFile: SourceFile;
	oldPath: string;
	newPath: string;
};

/**
 * 文件重命名/移动时需要更新的 import/export 声明信息。
 * @property declaration - 对应的 ImportDeclaration 或 ExportDeclaration 节点
 * @property resolvedPath - 原始 import/export 解析到的文件绝对路径
 * @property referencingFilePath - 包含该声明的文件的绝对路径
 * @property originalSpecifierText - 原始模块说明符文本（例如：'./utils'、'@/components'）
 * @property wasPathAlias - 原始说明符是否为路径别名（可选）
 */
export interface DeclarationToUpdate {
	declaration: ImportDeclaration | ExportDeclaration;
	resolvedPath: string;
	referencingFilePath: string;
	originalSpecifierText: string;
	wasPathAlias?: boolean;
}

/**
 * 符号移动时内部依赖关系的分类类型。
 * - `moveToNewFile`: 依赖也移动到新文件。
 * - `importFromOriginal`: 依赖保留在原文件，从新文件导入。
 * - `importFromOriginal_addedExport`: 依赖保留在原文件，添加导出以便从新文件导入。
 */
export type DependencyClassificationType =
	| "moveToNewFile"
	| "importFromOriginal"
	| "importFromOriginal_addedExport";

/**
 * 针对要移动的符号的内部依赖关系分类结果。
 */
export type DependencyClassification =
	// 依赖也移动到新文件，仅在内部使用（不导出）
	| { type: "moveToNewFile"; statement: Statement }
	// 依赖保留在原文件，从新文件 import
	| { type: "importFromOriginal"; statement: Statement; name: string }
	// 依赖保留在原文件，但为了从新文件 import 需要添加 export
	| { type: "addExport"; statement: Statement; name: string };

/**
 * 传递给 generateNewSourceFileContent 的外部导入信息的类型别名
 */
export type NeededExternalImports = Map<
	string, // moduleSpecifier (計算後の相対パス or オリジナル)
	{
		names: Set<string>; // 命名导入或默认（'default'）或别名
		declaration?: ImportDeclaration;
		isNamespaceImport?: boolean; // 是否为命名空间导入的标志
		namespaceImportName?: string; // 命名空间导入的标识符（例如：'path'）
	}
>;
