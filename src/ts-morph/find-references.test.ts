import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findSymbolReferences } from "./find-references";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * 创建测试用的临时目录
 * 用于在每个测试用例中创建独立的文件系统环境
 */
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "find-references-test-"));
}

/**
 * 递归删除目录
 * 用于清理测试后创建的临时文件和目录
 */
function removeTempDir(dir: string): void {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * findSymbolReferences 函数的测试套件
 * 
 * 这个测试文件验证了 findSymbolReferences 函数在各种场景下
 * 正确查找 TypeScript 符号（变量、函数、类、接口等）的定义和引用位置的能力。
 * 
 * 每个测试用例都会：
 * 1. 创建临时的 TypeScript 项目结构（包括 tsconfig.json 和源文件）
 * 2. 调用 findSymbolReferences 查找指定位置的符号
 * 3. 验证返回的定义位置和所有引用位置是否正确
 */
describe("findSymbolReferences", () => {
	let tempDir: string;

	beforeEach(() => {
		// 每个测试前创建新的临时目录，确保测试隔离
		tempDir = createTempDir();
	});

	afterEach(() => {
		// 每个测试后清理临时目录
		removeTempDir(tempDir);
	});

	/**
	 * 测试：能够找到基本变量的引用
	 * 
	 * 验证函数能够：
	 * - 找到导出变量的定义位置
	 * - 找到同一文件内对变量的引用
	 * - 找到其他文件中通过 import 导入后的使用位置
	 */
	it("能够找到基本变量的引用", async () => {
		// 在文件系统中创建测试项目结构
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

		// 创建 tsconfig.json 配置文件
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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		// 创建测试文件
		// utils.ts: 定义并导出 myVariable，并在 helperFunction 中使用它
		const utilsPath = path.join(srcDir, "utils.ts");
		// main.ts: 导入 myVariable 并在 console.log 中使用
		const mainPath = path.join(srcDir, "main.ts");

		fs.writeFileSync(
			utilsPath,
			`export const myVariable = "test value";

export function helperFunction() {
  return myVariable;
}
`,
		);

		fs.writeFileSync(
			mainPath,
			`import { myVariable, helperFunction } from "./utils";

console.log(myVariable);
const result = helperFunction();
`,
		);

		// 查找 myVariable 的引用（从定义位置开始）
		const result = await findSymbolReferences({
			tsconfigPath,
			targetFilePath: utilsPath,
			position: { line: 1, column: 14 }, // "myVariable" 的位置
		});

		// 验证定义位置是否正确
		expect(result.definition).toBeTruthy();
		expect(result.definition?.filePath).toBe(utilsPath);
		expect(result.definition?.line).toBe(1);
		expect(result.definition?.text).toContain("myVariable");

		// 验证引用位置（定义位置会被排除）
		// 包括 import 语句中的引用
		expect(result.references.length).toBeGreaterThanOrEqual(2);

		// 验证 utils.ts 文件内的引用（helperFunction 中使用 myVariable）
		const utilsRef = result.references.find(
			(ref) => ref.filePath === utilsPath && ref.line === 4,
		);
		expect(utilsRef).toBeTruthy();

		// 验证 main.ts 文件内的引用（import 语句和 console.log）
		const mainRefs = result.references.filter(
			(ref) => ref.filePath === mainPath,
		);
		expect(mainRefs.length).toBeGreaterThanOrEqual(1);

		// 确认 console.log 中的引用被包含
		const consoleLogRef = mainRefs.find((ref) => ref.line === 3);
		expect(consoleLogRef).toBeTruthy();
	});

	/**
	 * 测试：能够找到函数的引用
	 * 
	 * 验证函数能够：
	 * - 找到函数定义位置
	 * - 找到同一文件内对函数的调用
	 * - 找到其他文件中通过 import 导入后的函数调用
	 */
	it("能够找到函数的引用", async () => {
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		const functionsPath = path.join(srcDir, "functions.ts");
		const usagePath = path.join(srcDir, "usage.ts");

		// functions.ts: 定义 calculate 函数，并在 processData 中调用它
		fs.writeFileSync(
			functionsPath,
			`export function calculate(a: number, b: number): number {
  return a + b;
}

export function processData() {
  const result = calculate(10, 20);
  return result;
}
`,
		);

		// usage.ts: 导入并调用 calculate 函数
		fs.writeFileSync(
			usagePath,
			`import { calculate, processData } from "./functions";

const sum = calculate(5, 3);
console.log(sum);
processData();
`,
		);

		// 查找 calculate 函数的引用
		const result = await findSymbolReferences({
			tsconfigPath,
			targetFilePath: functionsPath,
			position: { line: 1, column: 17 }, // "calculate" 的位置
		});

		expect(result.definition).toBeTruthy();
		expect(result.definition?.filePath).toBe(functionsPath);

		// 验证引用位置（定义位置会被排除）
		// 包括 import 语句中的引用
		expect(result.references.length).toBeGreaterThanOrEqual(2);

		// 验证 functions.ts 文件内的引用（processData 中调用 calculate）
		const internalRef = result.references.find(
			(ref) => ref.filePath === functionsPath && ref.line === 6,
		);
		expect(internalRef).toBeTruthy();

		// 验证 usage.ts 文件内的引用
		const externalRefs = result.references.filter(
			(ref) => ref.filePath === usagePath,
		);
		expect(externalRefs.length).toBeGreaterThanOrEqual(1);

		// 确认 calculate(5, 3) 的调用被包含
		const callRef = externalRefs.find((ref) => ref.line === 3);
		expect(callRef).toBeTruthy();
	});

	/**
	 * 测试：能够找到类的引用
	 * 
	 * 验证函数能够：
	 * - 找到类定义位置
	 * - 找到其他类通过 extends 继承该类的位置
	 * - 找到其他文件中通过 new 关键字实例化该类的位置
	 */
	it("能够找到类的引用", async () => {
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		const modelsPath = path.join(srcDir, "models.ts");
		const appPath = path.join(srcDir, "app.ts");

		// models.ts: 定义 User 类，Admin 类继承 User
		fs.writeFileSync(
			modelsPath,
			`export class User {
  constructor(public name: string, public age: number) {}
  
  greet(): string {
    return \`Hello, I'm \${this.name}\`;
  }
}

export class Admin extends User {
  constructor(name: string, age: number, public role: string) {
    super(name, age);
  }
}
`,
		);

		// app.ts: 导入并实例化 User 类
		fs.writeFileSync(
			appPath,
			`import { User, Admin } from "./models";

const user = new User("John", 30);
const admin = new Admin("Jane", 25, "super-admin");

console.log(user.greet());
`,
		);

		// 查找 User 类的引用
		const result = await findSymbolReferences({
			tsconfigPath,
			targetFilePath: modelsPath,
			position: { line: 1, column: 14 }, // "User" 的位置
		});

		expect(result.definition).toBeTruthy();
		expect(result.definition?.filePath).toBe(modelsPath);

		// 验证引用位置
		expect(result.references.length).toBeGreaterThanOrEqual(2);

		// 验证 Admin 类中的继承引用（extends User）
		const extendsRef = result.references.find(
			(ref) => ref.filePath === modelsPath && ref.text.includes("extends"),
		);
		expect(extendsRef).toBeTruthy();

		// 验证 app.ts 中的实例化引用（new User）
		const instantiationRef = result.references.find(
			(ref) => ref.filePath === appPath && ref.text.includes("new User"),
		);
		expect(instantiationRef).toBeTruthy();
	});

	/**
	 * 测试：对不存在的符号抛出错误
	 * 
	 * 验证当指定了无效的位置（如文件不存在的行号）时，
	 * 函数能够正确抛出错误，而不是返回错误的结果。
	 */
	it("对不存在的符号抛出错误", async () => {
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		const testPath = path.join(srcDir, "test.ts");
		// 创建一个只有一行代码的文件
		fs.writeFileSync(
			testPath,
			`const someVariable = "test";
`,
		);

		// 指定不存在的行号（文件只有1行，但指定第10行）
		await expect(
			findSymbolReferences({
				tsconfigPath,
				targetFilePath: testPath,
				position: { line: 10, column: 1 }, // 不存在的行
			}),
		).rejects.toThrow();
	});

	/**
	 * 测试：能够找到被 re-export 的符号的引用
	 * 
	 * 验证函数能够：
	 * - 找到原始定义位置
	 * - 找到通过 re-export 重新导出的位置（包括别名导出）
	 * - 找到通过 re-export 路径导入后的使用位置
	 * 
	 * 这个测试场景模拟了常见的模块组织方式：
	 * utils.ts (原始定义) -> index.ts (re-export) -> app.ts (使用)
	 */
	it("能够找到被 re-export 的符号的引用", async () => {
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		const utilsPath = path.join(srcDir, "utils.ts");
		const indexPath = path.join(srcDir, "index.ts");
		const appPath = path.join(srcDir, "app.ts");

		// utils.ts - 原始定义位置
		fs.writeFileSync(
			utilsPath,
			`export function helper() {
  return "helper function";
}

export const CONSTANT = 42;
`,
		);

		// index.ts - 通过 re-export 重新导出（包括别名导出）
		fs.writeFileSync(
			indexPath,
			`export { helper, CONSTANT } from "./utils";
export { helper as utilHelper } from "./utils"; // 别名 re-export
`,
		);

		// app.ts - 通过 re-export 路径导入并使用
		fs.writeFileSync(
			appPath,
			`import { helper, CONSTANT, utilHelper } from "./index";

console.log(helper());
console.log(CONSTANT);
console.log(utilHelper());
`,
		);

		// 查找 helper 函数的引用
		const result = await findSymbolReferences({
			tsconfigPath,
			targetFilePath: utilsPath,
			position: { line: 1, column: 17 }, // "helper" 的位置
		});

		expect(result.definition).toBeTruthy();
		expect(result.definition?.filePath).toBe(utilsPath);

		// 验证引用位置包括：re-export 语句、import 语句、使用位置
		expect(result.references.length).toBeGreaterThanOrEqual(3);

		// 验证 index.ts 中的 re-export 引用
		const reExportRefs = result.references.filter(
			(ref) => ref.filePath === indexPath,
		);
		expect(reExportRefs.length).toBeGreaterThanOrEqual(2); // 普通 re-export 和别名 re-export

		// 验证 app.ts 中的使用
		const appRefs = result.references.filter((ref) => ref.filePath === appPath);
		expect(appRefs.length).toBeGreaterThanOrEqual(1);
	});

	/**
	 * 测试：能够在有循环引用的文件间找到引用
	 * 
	 * 验证函数能够正确处理循环依赖的情况：
	 * - moduleA 导入 moduleB
	 * - moduleB 导入 moduleA
	 * 
	 * 即使存在循环引用，函数仍应能正确找到跨文件的符号引用。
	 */
	it("能够在有循环引用的文件间找到引用", async () => {
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		const moduleAPath = path.join(srcDir, "moduleA.ts");
		const moduleBPath = path.join(srcDir, "moduleB.ts");

		// moduleA.ts - 导入并引用 moduleB
		fs.writeFileSync(
			moduleAPath,
			`import { functionB } from "./moduleB";

export function functionA() {
  return "A";
}

export function useB() {
  return functionB();
}
`,
		);

		// moduleB.ts - 导入并引用 moduleA（形成循环引用）
		fs.writeFileSync(
			moduleBPath,
			`import { functionA } from "./moduleA";

export function functionB() {
  return "B";
}

export function useA() {
  return functionA();
}
`,
		);

		// 查找 functionA 的引用
		const result = await findSymbolReferences({
			tsconfigPath,
			targetFilePath: moduleAPath,
			position: { line: 3, column: 17 }, // "functionA" 的位置
		});

		expect(result.definition).toBeTruthy();
		expect(result.definition?.filePath).toBe(moduleAPath);

		// 验证 moduleB 中的引用（即使存在循环引用也能找到）
		const moduleBRefs = result.references.filter(
			(ref) => ref.filePath === moduleBPath,
		);
		expect(moduleBRefs.length).toBeGreaterThanOrEqual(1);

		// 验证 useA 函数中的使用
		const useARef = moduleBRefs.find((ref) => ref.text.includes("functionA()"));
		expect(useARef).toBeTruthy();
	});

	/**
	 * 测试：能够找到接口的引用
	 * 
	 * 验证函数能够：
	 * - 找到接口定义位置
	 * - 找到其他接口通过 extends 继承该接口的位置
	 * - 找到其他文件中在类型注解（函数参数、变量声明等）中使用该接口的位置
	 */
	it("能够找到接口的引用", async () => {
		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		const srcDir = path.join(tempDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });

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
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);

		const typesPath = path.join(srcDir, "types.ts");
		const implementationPath = path.join(srcDir, "implementation.ts");

		// types.ts: 定义 UserData 接口，AdminData 接口继承 UserData
		fs.writeFileSync(
			typesPath,
			`export interface UserData {
  id: number;
  name: string;
  email: string;
}

export interface AdminData extends UserData {
  role: string;
}
`,
		);

		// implementation.ts: 在类型注解中使用 UserData 接口
		fs.writeFileSync(
			implementationPath,
			`import { UserData, AdminData } from "./types";

function processUser(user: UserData): void {
  console.log(user.name);
}

const userData: UserData = {
  id: 1,
  name: "John",
  email: "john@example.com"
};

const adminData: AdminData = {
  id: 2,
  name: "Jane",
  email: "jane@example.com",
  role: "admin"
};

processUser(userData);
processUser(adminData);
`,
		);

		// 查找 UserData 接口的引用
		const result = await findSymbolReferences({
			tsconfigPath,
			targetFilePath: typesPath,
			position: { line: 1, column: 18 }, // "UserData" 的位置
		});

		expect(result.definition).toBeTruthy();
		expect(result.definition?.filePath).toBe(typesPath);

		// 验证引用位置
		expect(result.references.length).toBeGreaterThanOrEqual(3);

		// 验证 types.ts 文件内继承中的引用（AdminData extends UserData）
		const extendsRef = result.references.find(
			(ref) => ref.filePath === typesPath && ref.text.includes("extends"),
		);
		expect(extendsRef).toBeTruthy();

		// 验证 implementation.ts 文件内类型注解中的引用
		const typeAnnotationRefs = result.references.filter(
			(ref) => ref.filePath === implementationPath,
		);
		expect(typeAnnotationRefs.length).toBeGreaterThanOrEqual(2); // 函数参数和变量声明
	});
});
