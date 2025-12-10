import { valueA, runA, type InterfaceA } from "./moduleA-renamed";
import { utilFunc1 } from "./utils-funcs";
import { utilFunc2 } from "./utils";

export const valueB = `Value from Module B using ${valueA}`;

function privateHelperB() {
	return `${utilFunc2()} from B`;
}

export function funcB(): InterfaceA {
	console.log("Function B executed");
	utilFunc1();
	const resultA = runA();
	console.log("Result from funcA:", resultA);
	console.log(privateHelperB());
	return { id: 1, name: valueB };
}

console.log(valueB);
