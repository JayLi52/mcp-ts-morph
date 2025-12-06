export class TimeoutError extends Error {
	constructor(
		message: string,
		public readonly durationSeconds: number,
	) {
		super(message);
		this.name = "TimeoutError";
		// 显式设置原型。
		Object.setPrototypeOf(this, TimeoutError.prototype);
	}
}
