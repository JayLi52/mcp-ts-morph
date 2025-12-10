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
): Promise<void> {
    signal?.throwIfAborted();
    try {
        const changed = project.getSourceFiles().filter((sf) => !sf.isSaved());
        const hasWindowsAbsoluteOutsideCwd = changed.some((sf) => {
            let p = sf.getFilePath();
            p = p.replace(/^[/\\]+(?=[a-zA-Z]:)/, "");
            const normalizedP = path.normalize(p);
            const cwdNorm = path.normalize(process.cwd());
            return /^[a-zA-Z]:[\\/]/.test(p) && !normalizedP.toLowerCase().startsWith(cwdNorm.toLowerCase());
        });

        if (hasWindowsAbsoluteOutsideCwd) {
            for (const sf of changed) {
                let filePath = sf.getFilePath();
                filePath = filePath.replace(/^[/\\]+(?=[a-zA-Z]:)/, "");
                const normalizedFilePath = path.normalize(filePath);
                const content = sf.getFullText();
                const dir = path.dirname(normalizedFilePath);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(normalizedFilePath, content, "utf-8");
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
