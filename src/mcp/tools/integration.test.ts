import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerTsMorphTools } from "./ts-morph-tools";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * 创建测试用的临时目录
 */
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "mcp-integration-test-"));
}

/**
 * 递归删除目录
 */
function removeTempDir(dir: string): void {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * 工具返回结果的类型
 */
interface ToolResult {
	content: Array<{
		type: string;
		text: string;
	}>;
	isError?: boolean;
}

/**
 * 工具处理函数类型
 */
type ToolHandler<T = unknown> = (args: T) => Promise<ToolResult>;

/**
 * MCP 服务器的模拟
 */
interface MockServer {
	tool: <T>(
		name: string,
		description: string,
		schema: unknown,
		handler: (args: T) => Promise<unknown>,
	) => void;
	callTool: <T>(name: string, args: T) => Promise<ToolResult>;
}

/**
 * 创建 MCP 服务器的模拟
 */
function createMockServer(): MockServer {
	const tools = new Map<string, { handler: ToolHandler<unknown> }>();

	return {
		tool: <T>(
			name: string,
			_description: string,
			_schema: unknown, // z.ZodSchema<T>
			handler: (args: T) => Promise<unknown>,
		) => {
			tools.set(name, { handler: handler as ToolHandler<unknown> });
		},
		callTool: async <T>(name: string, args: T) => {
			const tool = tools.get(name);
			if (!tool) {
				throw new Error(`Tool ${name} not found`);
			}
			return await tool.handler(args);
		},
	};
}

describe("MCP Tools 統合テスト", () => {
	let tempDir: string;
	let tsconfigPath: string;
	let srcDir: string;
	let mockServer: MockServer;

	beforeEach(() => {
		tempDir = createTempDir();
		tsconfigPath = path.join(tempDir, "tsconfig.json");
		srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

    // 创建 tsconfig.json
		fs.writeFileSync(
			tsconfigPath,
			JSON.stringify(
				{
					compilerOptions: {
						rootDir: "./src",
						outDir: "./dist",
						module: "commonjs",
						target: "es2020",
						strict: true,
						baseUrl: ".",
						paths: {
							"@/*": ["src/*"],
						},
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

        // 创建模拟服务器并注册工具
        mockServer = createMockServer();
        // 将测试用模拟对象强制转换为 McpServer
        // 不修改实现，测试侧进行适配
        registerTsMorphTools(mockServer as unknown as McpServer);
	});

	afterEach(() => {
		removeTempDir(tempDir);
	});

	describe("rename_symbol_by_tsmorph", () => {
		it("シンボルのリネームが正しく動作する", async () => {
			const utilsPath = path.join(srcDir, "utils.ts");
			const mainPath = path.join(srcDir, "main.ts");

			fs.writeFileSync(
				utilsPath,
				`export function calculateSum(a: number, b: number): number {
  return a + b;
}

export const VERSION = "1.0.0";
`,
			);

			fs.writeFileSync(
				mainPath,
				`import { calculateSum, VERSION } from "./utils";

const result = calculateSum(10, 20);
console.log(result);
console.log(VERSION);
`,
			);

            // 调用 rename_symbol_by_tsmorph 工具
			await mockServer.callTool("rename_symbol_by_tsmorph", {
				tsconfigPath,
				targetFilePath: utilsPath,
                position: { line: 1, column: 17 }, // "calculateSum" 的位置
				symbolName: "calculateSum",
				newName: "addNumbers",
				dryRun: false,
			});

			// ファイルが更新されていることを確認
			const updatedUtilsContent = fs.readFileSync(utilsPath, "utf-8");
			const updatedMainContent = fs.readFileSync(mainPath, "utf-8");

			expect(updatedUtilsContent).toContain("function addNumbers");
			expect(updatedMainContent).toContain("import { addNumbers");
			expect(updatedMainContent).toContain("addNumbers(10, 20)");
		});

		it("dryRunモードで変更をプレビューできる", async () => {
			const filePath = path.join(srcDir, "test.ts");

			fs.writeFileSync(
				filePath,
				`const oldName = "test";
console.log(oldName);
`,
			);

            // 以 dryRun 模式运行
			await mockServer.callTool("rename_symbol_by_tsmorph", {
				tsconfigPath,
				targetFilePath: filePath,
                position: { line: 1, column: 7 }, // "oldName" 的位置
				symbolName: "oldName",
				newName: "newName",
				dryRun: true,
			});

			// ファイルが変更されていないことを確認
			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toContain("oldName");
			expect(content).not.toContain("newName");
		});
	});

	describe("find_references_by_tsmorph", () => {
		it("シンボルの参照を見つけることができる", async () => {
			const libPath = path.join(srcDir, "lib.ts");
			const app1Path = path.join(srcDir, "app1.ts");
			const app2Path = path.join(srcDir, "app2.ts");

			fs.writeFileSync(
				libPath,
				`export class Logger {
  log(message: string) {
    console.log(message);
  }
}

export const logger = new Logger();
`,
			);

			fs.writeFileSync(
				app1Path,
				`import { Logger } from "./lib";

const myLogger = new Logger();
myLogger.log("Hello from app1");
`,
			);

			fs.writeFileSync(
				app2Path,
				`import { logger } from "./lib";

logger.log("Hello from app2");
`,
			);

            // 调用 find_references_by_tsmorph 工具
			const result = await mockServer.callTool("find_references_by_tsmorph", {
				tsconfigPath,
				targetFilePath: libPath,
                position: { line: 1, column: 14 }, // "Logger" 类的位置
			});

			expect(result).toBeDefined();
            // 检查结果结构（根据实际实现进行调整）
			expect(result).toHaveProperty("content");
			const content = result.content[0]?.text || "";
			expect(content.toLowerCase()).toContain("reference");
		});
	});

	describe("remove_path_alias_by_tsmorph", () => {
		it("パスエイリアスを相対パスに変換できる", async () => {
			const utilsPath = path.join(srcDir, "utils", "math.ts");
			const appPath = path.join(srcDir, "app.ts");

			fs.mkdirSync(path.dirname(utilsPath), { recursive: true });

			fs.writeFileSync(
				utilsPath,
				`export function multiply(a: number, b: number): number {
  return a * b;
}
`,
			);

			fs.writeFileSync(
				appPath,
				`import { multiply } from "@/utils/math";

console.log(multiply(3, 4));
`,
			);

            // 调用 remove_path_alias_by_tsmorph 工具
			await mockServer.callTool("remove_path_alias_by_tsmorph", {
				tsconfigPath,
				targetPath: appPath,
				dryRun: false,
			});

            // 确认路径别名已被转换为相对路径
			const updatedContent = fs.readFileSync(appPath, "utf-8");
			expect(updatedContent).toContain('from "./utils/math"');
			expect(updatedContent).not.toContain('from "@/utils/math"');
		});
	});

	describe("rename_filesystem_entry_by_tsmorph", () => {
		it("ファイル名を変更してインポートを更新できる", async () => {
			const oldPath = path.join(srcDir, "old-name.ts");
			const newPath = path.join(srcDir, "new-name.ts");
			const importerPath = path.join(srcDir, "importer.ts");

			fs.writeFileSync(oldPath, "export const data = { value: 42 };");

			fs.writeFileSync(
				importerPath,
				`import { data } from "./old-name";

console.log(data.value);
`,
			);

            // 调用 rename_filesystem_entry_by_tsmorph 工具
			await mockServer.callTool("rename_filesystem_entry_by_tsmorph", {
				tsconfigPath,
				renames: [{ oldPath, newPath }],
				dryRun: false,
			});

            // 确认文件已被重命名
			expect(fs.existsSync(newPath)).toBe(true);
			expect(fs.existsSync(oldPath)).toBe(false);

            // 确认 import 已被更新
			const updatedImporterContent = fs.readFileSync(importerPath, "utf-8");
			expect(updatedImporterContent).toContain('from "./new-name"');
		});
	});

	describe("move_symbol_to_file_by_tsmorph", () => {
		it("シンボルを別ファイルに移動できる", async () => {
			const sourcePath = path.join(srcDir, "source.ts");
			const targetPath = path.join(srcDir, "target.ts");
			const consumerPath = path.join(srcDir, "consumer.ts");

			fs.writeFileSync(
				sourcePath,
				`export function funcToMove() {
  return "moved";
}

export function funcToStay() {
  return "stayed";
}
`,
			);

			fs.writeFileSync(
				consumerPath,
				`import { funcToMove, funcToStay } from "./source";

console.log(funcToMove());
console.log(funcToStay());
`,
			);

            // 调用 move_symbol_to_file_by_tsmorph 工具
			await mockServer.callTool("move_symbol_to_file_by_tsmorph", {
				tsconfigPath,
                originalFilePath: sourcePath, // 使用 originalFilePath 而非 sourceFilePath
				targetFilePath: targetPath,
                symbolToMove: "funcToMove", // 使用 symbolToMove 而非 symbolName
				declarationKindString: "FunctionDeclaration",
				dryRun: false,
			});

            // 确认目标文件已创建且符号已移动
			expect(fs.existsSync(targetPath)).toBe(true);
			const targetContent = fs.readFileSync(targetPath, "utf-8");
			expect(targetContent).toContain("function funcToMove");

            // 确认源文件中的符号已被移除
			const sourceContent = fs.readFileSync(sourcePath, "utf-8");
			expect(sourceContent).not.toContain("function funcToMove");
			expect(sourceContent).toContain("function funcToStay");

            // 确认消费方的 import 已更新
			const consumerContent = fs.readFileSync(consumerPath, "utf-8");
			expect(consumerContent).toContain('from "./target"');
			expect(consumerContent).toContain('from "./source"');
		});
	});

	describe("エラーハンドリング", () => {
		it("存在しないファイルに対してエラーを返す", async () => {
			const nonExistentPath = path.join(srcDir, "non-existent.ts");

			const result = await mockServer.callTool("rename_symbol_by_tsmorph", {
				tsconfigPath,
				targetFilePath: nonExistentPath,
				position: { line: 1, column: 1 },
				symbolName: "test",
				newName: "renamed",
				dryRun: false,
			});

            // MCP 工具返回错误但不抛出异常
			expect(result).toHaveProperty("isError", true);
			expect(result.content[0]?.text).toContain("Error");
		});

		it("不正なシンボル名でエラーを返す", async () => {
			const testPath = path.join(srcDir, "test.ts");

			fs.writeFileSync(testPath, `const validName = "test";`);

			const result = await mockServer.callTool("rename_symbol_by_tsmorph", {
				tsconfigPath,
				targetFilePath: testPath,
				position: { line: 1, column: 7 },
				symbolName: "wrongName", // 実際のシンボル名と異なる
				newName: "renamed",
				dryRun: false,
			});

            // MCP 工具返回错误但不抛出异常
			expect(result).toHaveProperty("isError", true);
			expect(result.content[0]?.text).toContain("Error");
		});
	});
});
