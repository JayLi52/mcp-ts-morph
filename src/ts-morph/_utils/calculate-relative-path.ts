import * as path from "node:path";

const DEFAULT_EXTENSIONS_TO_REMOVE = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".json",
	".mjs",
	".cjs",
];

/**
 * 计算用于模块说明符的相对路径
 * fromPath: 引用源文件的绝对路径
 * toPath: 引用目标文件的绝对路径
 * @param options.simplifyIndex 是否简化以 /index 结尾的路径（默认：true）
 * @param options.removeExtensions 要移除的扩展名列表，true 使用默认列表，false 不移除（默认：DEFAULT_EXTENSIONS_TO_REMOVE）
 * @returns POSIX 格式的相对路径（以 ./ 或 ../ 开头）
 */
export function calculateRelativePath(
	fromPath: string,
	toPath: string,
	options: {
		simplifyIndex?: boolean;
		removeExtensions?: boolean | string[];
	} = {},
): string {
	const defaultOptions = {
		simplifyIndex: true,
		removeExtensions: DEFAULT_EXTENSIONS_TO_REMOVE as string[] | boolean,
	};
	const mergedOptions = { ...defaultOptions, ...options };

	const fromDir = path.dirname(fromPath);
	const relative = path.relative(fromDir, toPath);

	// 转换为 POSIX 形式，并调整为以 ./ 开头
	let formatted = relative.replace(/\\/g, "/");
	if (!formatted.startsWith(".") && !formatted.startsWith("/")) {
		formatted = `./${formatted}`;
	}

	// index 简化处理
	// 当 simplifyIndex 为 true 且 removeExtensions !== false 时执行
	if (mergedOptions.simplifyIndex && mergedOptions.removeExtensions !== false) {
		const indexMatch = formatted.match(
			/^(\.\.?(\/\.\.)*)\/index(\.(ts|tsx|js|jsx|json))?$/,
		);
		if (indexMatch) {
			return indexMatch[1] === "." ? "." : indexMatch[1];
		}
	}

	const originalExt = path.extname(formatted);

	// 如指定则移除扩展名
	if (mergedOptions.removeExtensions) {
		const extensionsToRemove =
			mergedOptions.removeExtensions === true
				? DEFAULT_EXTENSIONS_TO_REMOVE
				: (mergedOptions.removeExtensions as string[]);
		if (extensionsToRemove.includes(originalExt)) {
			formatted = formatted.slice(0, -originalExt.length);
		}
	}

	return formatted;
}
