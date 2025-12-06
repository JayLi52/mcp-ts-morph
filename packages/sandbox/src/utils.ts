import { valueA } from "./moduleA"; // 依赖 moduleA

// 导出的函数
export function utilFunc1(): void {
	console.log("Util Func 1 executed with value:", valueA);
}

// 不导出的内部辅助函数
function internalUtil(): string {
	return "Internal Util Result";
}

// 使用内部辅助函数的另一个导出函数
export function utilFunc2(): string {
	const internalResult = internalUtil();
	return `Util Func 2 using ${internalResult}`;
}

function anotherInternalConsumer(): string {
	return `Another consumer: ${internalUtil()}`;
}

export function publicConsumer(): string {
	return anotherInternalConsumer();
}

export const utilValue = 123;

export type UtilType = {
	key: string;
	value: number;
};
