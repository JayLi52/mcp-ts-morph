import { Project, SyntaxKind, type Identifier } from "ts-morph";
import { describe, it, expect } from "vitest";
import { findIdentifierNode, validateSymbol } from "./rename-symbol";

// --- 测试环境搭建 ---

const TEST_FILE_PATH = "/test.ts";

const setupProject = () => {
	const project = new Project({ useInMemoryFileSystem: true });

	const getIdentifier = (
		content: string,
		position: { line: number; column: number },
	): Identifier => {
		project.createSourceFile(TEST_FILE_PATH, content, {
			overwrite: true,
		});
		return findIdentifierNode(project, TEST_FILE_PATH, position);
	};
	return { project, getIdentifier };
};

describe("findIdentifierNode", () => {
    it("可以在指定位置找到函数标识符", () => {
		const { getIdentifier } = setupProject();
		const fileContent = "function myFunction() {}";
		const identifier = getIdentifier(fileContent, { line: 1, column: 10 });
		expect(identifier.getText()).toBe("myFunction");
		expect(identifier.getParent()?.getKind()).toBe(
			SyntaxKind.FunctionDeclaration,
		);
	});

    it("可以在指定位置找到变量标识符", () => {
		const { getIdentifier } = setupProject();
		const fileContent = "const myVariable = 1;";
		const identifier = getIdentifier(fileContent, { line: 1, column: 7 });
		expect(identifier.getText()).toBe("myVariable");
		expect(identifier.getParent()?.getKind()).toBe(
			SyntaxKind.VariableDeclaration,
		);
	});

    it("即使指定位置在标识符文本内部也能找到标识符", () => {
		const { getIdentifier } = setupProject();
		const fileContent = "function myFunction() {}";
		const identifier = getIdentifier(fileContent, { line: 1, column: 12 });
		expect(identifier.getText()).toBe("myFunction");
	});

    it("当文件不存在时抛出错误", () => {
		const { project } = setupProject();
		expect(() =>
			findIdentifierNode(project, "/nonexistent.ts", { line: 1, column: 1 }),
        ).toThrowError(new Error("未找到文件: /nonexistent.ts"));
	});

    it("当指定位置未找到节点（越界）时抛出错误", () => {
		const { project } = setupProject();
		const fileContent = "const x = 1;";
		project.createSourceFile(TEST_FILE_PATH, fileContent);
		expect(() =>
			findIdentifierNode(project, TEST_FILE_PATH, { line: 5, column: 1 }),
        ).toThrowError(new Error("指定位置 (5:1) 超出文件范围或无效"));
	});

    it("当指定位置的节点不是标识符（例如关键字）时抛出错误", () => {
		const { project } = setupProject();
		const fileContent = "function myFunction() {}";
		project.createSourceFile(TEST_FILE_PATH, fileContent);
		expect(() =>
			findIdentifierNode(project, TEST_FILE_PATH, { line: 1, column: 3 }),
        ).toThrowError(new Error("指定位置 (1:3) 不是 Identifier"));
	});
});

describe("validateSymbol", () => {
    it("当符号名一致时不应产生错误", () => {
		const { getIdentifier } = setupProject();
		const identifier = getIdentifier("function myFunc() {}", {
			line: 1,
			column: 10,
		});
		expect(() => validateSymbol(identifier, "myFunc")).not.toThrow();
	});
    it("当符号名不一致时抛出错误", () => {
		const { getIdentifier } = setupProject();
		const identifier = getIdentifier("function myFunc() {}", {
			line: 1,
			column: 10,
		});
        expect(() => validateSymbol(identifier, "wrongName")).toThrowError(
            new Error("符号名不匹配（期望: wrongName, 实际: myFunc）"),
        );
	});
});
