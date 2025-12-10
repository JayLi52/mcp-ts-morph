import { Project, type SourceFile } from "ts-morph";
import * as path from "node:path";
import * as fs from "node:fs";
import { NewLineKind } from "typescript";
import logger from "../../utils/logger";

export function initializeProject(tsconfigPath: string): Project {
	const absoluteTsconfigPath = path.resolve(tsconfigPath);
	return new Project({
		tsConfigFilePath: absoluteTsconfigPath,
		manipulationSettings: {
			newLineKind: NewLineKind.LineFeed,
		},
	});
}

export function getChangedFiles(project: Project): SourceFile[] {
	return project.getSourceFiles().filter((sf) => !sf.isSaved());
}

export async function saveProjectChanges(
    project: Project,
    signal?: AbortSignal,
    renames?: Array<{ oldPath: string; newPath: string }>,
): Promise<void> {
    signal?.throwIfAborted();
    try {
        const changed = project.getSourceFiles().filter((sf) => !sf.isSaved());
        const isWindowsAbsolute = (p: string) => {
            const cleaned = p.replace(/^[/\\]+(?=[a-zA-Z]:)/, "");
            return /^[a-zA-Z]:[\\/]/.test(cleaned);
        };
        const hasWindowsAbsolute = changed.some((sf) => isWindowsAbsolute(sf.getFilePath()));

        if (hasWindowsAbsolute) {
            const normalized = (p: string) => path.normalize(p.replace(/^[/\\]+(?=[a-zA-Z]:)/, ""));
            const written = new Set<string>();
            for (const sf of changed) {
                const targetPath = normalized(sf.getFilePath());
                const content = sf.getFullText();
                const dir = path.dirname(targetPath);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(targetPath, content, "utf-8");
                written.add(targetPath.toLowerCase());
            }
            if (renames && renames.length > 0) {
                for (const { oldPath, newPath } of renames) {
                    const oldNorm = normalized(oldPath);
                    const newNorm = normalized(newPath);
                    if (oldNorm.toLowerCase() !== newNorm.toLowerCase()) {
                        try {
                            if (fs.existsSync(oldNorm)) {
                                fs.rmSync(oldNorm, { force: true });
                            }
                        } catch (e) {
                            logger.warn({ err: e, oldPath: oldNorm }, "删除旧文件失败");
                        }
                    }
                }
            }
            return;
        }

        await project.save();
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`保存文件时发生错误: ${message}`);
    }
}

export function getTsConfigPaths(
	project: Project,
): Record<string, string[]> | undefined {
	try {
		const options = project.compilerOptions.get();
		if (!options.paths) {
			return undefined;
		}
		if (typeof options.paths !== "object") {
			logger.warn(
				{ paths: options.paths },
				"编译器选项 'paths' 不是对象。",
			);
			return undefined;
		}

		const validPaths: Record<string, string[]> = {};
		for (const [key, value] of Object.entries(options.paths)) {
			if (
				Array.isArray(value) &&
				value.every((item) => typeof item === "string")
			) {
				validPaths[key] = value;
			} else {
				logger.warn(
					{ pathKey: key, pathValue: value },
					"paths 条目格式无效，已跳过。",
				);
			}
		}
		return validPaths;
	} catch (error) {
		logger.error({ err: error }, "获取编译选项或 paths 失败");
		return undefined;
	}
}

export function getTsConfigBaseUrl(project: Project): string | undefined {
	try {
		const options = project.compilerOptions.get();
		return options.baseUrl;
	} catch (error) {
		logger.error({ err: error }, "获取编译选项 baseUrl 失败");
		return undefined;
	}
}
