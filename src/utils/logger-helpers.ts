import * as fs from "node:fs";
import * as path from "node:path";
import type pino from "pino";
import { z } from "zod";

const DEFAULT_NODE_ENV = "development";
const DEFAULT_LOG_LEVEL: pino.Level = "info";
const DEFAULT_LOG_OUTPUT: "console" | "file" = "console";
const DEFAULT_LOG_FILE_PATH = path.resolve(process.cwd(), "app.log");

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default(DEFAULT_NODE_ENV),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace"])
		.default(DEFAULT_LOG_LEVEL),
	LOG_OUTPUT: z.enum(["console", "file"]).default(DEFAULT_LOG_OUTPUT),
	LOG_FILE_PATH: z.string().default(DEFAULT_LOG_FILE_PATH),
});

type EnvConfig = z.infer<typeof envSchema>;

/**
 * 使用 Zod 模式解析环境变量并返回已验证的配置对象。
 * 解析失败时会在控制台输出错误信息，
 * 并返回带有默认值的配置对象。
 *
 * @returns {EnvConfig} 已验证或默认的环境变量配置。
 */
export function parseEnvVariables(): EnvConfig {
	const parseResult = envSchema.safeParse(process.env);

	if (!parseResult.success) {
		// 仅在非测试环境输出错误
		if (process.env.NODE_ENV !== "test") {
			console.error(
				"❌ 环境变量不合法:",
				parseResult.error.flatten().fieldErrors,
				"\n已回退到默认日志配置。",
			);
		}
		return {
			NODE_ENV: DEFAULT_NODE_ENV,
			LOG_LEVEL: DEFAULT_LOG_LEVEL,
			LOG_OUTPUT: DEFAULT_LOG_OUTPUT,
			LOG_FILE_PATH: DEFAULT_LOG_FILE_PATH,
		};
	}

	const parsedEnv = parseResult.data;
	if (parsedEnv.LOG_OUTPUT === "file") {
		parsedEnv.LOG_FILE_PATH = path.resolve(parsedEnv.LOG_FILE_PATH);
	}
	return parsedEnv;
}

/**
 * 生成用于文件日志输出的 Pino Transport 配置对象。
 * 若日志目录不存在则尝试创建。
 * 若目录准备失败则返回 undefined。
 *
 * @param {string} logFilePath - 日志文件的绝对路径。
 * @returns {pino.TransportSingleOptions | undefined} 文件 Transport 配置，或失败时为 undefined。
 */
function setupLogFileTransport(
	logFilePath: string,
): pino.TransportSingleOptions | undefined {
	const logDir = path.dirname(logFilePath);

	try {
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
			console.log(`已创建日志目录: ${logDir}`);
		}
	} catch (err) {
		console.error(
			`检查/创建日志目录时发生错误: ${logDir}`,
			err,
		);
		return undefined;
	}

	if (!fs.existsSync(logDir)) {
		console.error(
			`文件日志已禁用：无法确认日志目录 ${logDir} 的存在。`,
		);
		return undefined;
	}

	console.log(`将日志输出到文件: ${logFilePath}`);
	return {
		target: "pino/file",
		options: { destination: logFilePath, mkdir: false },
	};
}

/**
 * 生成用于控制台日志输出的 Pino Transport 配置对象。
 * 在非生产环境下尝试使用 pino-pretty。
 * 若无法使用或在生产环境，则返回 undefined（使用 Pino 默认的标准输出 JSON）。
 *
 * @param {string} nodeEnv - 当前的 NODE_ENV（`development`, `production`, `test`）。
 * @returns {pino.TransportSingleOptions | undefined} 控制台 Transport 配置（用于 pino-pretty），或无需配置时为 undefined。
 */
function setupConsoleTransport(
	nodeEnv: string,
): pino.TransportSingleOptions | undefined {
	if (nodeEnv === "production") {
		return undefined;
	}

	try {
		require.resolve("pino-pretty");
		// 由于测试环境不需要，仅在开发环境输出日志
		if (nodeEnv === "development") {
			console.log("控制台日志将使用 pino-pretty。");
		}
		return {
			target: "pino-pretty",
			options: { colorize: true, ignore: "pid,hostname" },
		};
	} catch (e) {
		// 由于测试环境不需要，仅在开发环境输出日志
		if (nodeEnv === "development") {
			console.log(
				"未找到 pino-pretty。将使用默认的 JSON 控制台日志。",
			);
		}
		return undefined;
	}
}

/**
 * 根据 NODE_ENV 和日志输出位置配置合适的 Pino Transport。
 * 在测试环境不设置 Transport，日志将写入标准输出。
 *
 * @param {string} nodeEnv - 当前的 NODE_ENV。
 * @param {"console" | "file"} logOutput - 日志的输出位置。
 * @param {string} logFilePath - 文件输出时的日志文件路径。
 * @returns {pino.TransportSingleOptions | undefined} 已配置的 Transport，或不需要时为 undefined。
 */
export function configureTransport(
	nodeEnv: string,
	logOutput: "console" | "file",
	logFilePath: string,
): pino.TransportSingleOptions | undefined {
	if (logOutput === "file") {
		return setupLogFileTransport(logFilePath);
	}

	return setupConsoleTransport(nodeEnv);
}

/**
 * 在进程结束事件或发生异常时刷新日志并结束进程的处理器。
 *
 * @param {pino.Logger} logger - 使用的 Pino 日志实例。
 * @param {string} evt - 发生的事件名（例如：'SIGINT'、'uncaughtException'）。
 * @param {Error | number | null} [err] - 相关的错误对象或退出码。
 */
function exitHandler(
	logger: pino.Logger,
	evt: string,
	err?: Error | number | null,
) {
	const isTestEnv = process.env.NODE_ENV === "test";
	try {
		logger.flush();
	} catch (flushErr) {
		if (!isTestEnv) {
			console.error("退出时刷新日志出错:", flushErr);
		}
	}

	const errorObj =
		err instanceof Error
			? err
			: err != null
				? new Error(`退出码或原因: ${err}`)
				: null;

	if (!isTestEnv) {
		console.log(`进程结束 (${evt})...`);
	}

	if (errorObj) {
		if (!isTestEnv) {
			console.error("退出错误:", errorObj);
		}
		process.removeAllListeners("uncaughtException");
		process.removeAllListeners("unhandledRejection");
		process.exit(1);
	} else {
		process.exit(0);
	}
}

/**
 * 捕获 SIGINT、SIGTERM、uncaughtException、unhandledRejection 事件，
 * 并在进程上设置调用 exitHandler 的监听器。
 * 同时也设置普通的 exit 事件监听器。
 *
 * @param {pino.Logger} logger - 传递给 exitHandler 的 Pino 日志实例。
 */
export function setupExitHandlers(logger: pino.Logger) {
	process.once("SIGINT", () => exitHandler(logger, "SIGINT"));
	process.once("SIGTERM", () => exitHandler(logger, "SIGTERM"));
	process.once("uncaughtException", (err) =>
		exitHandler(logger, "uncaughtException", err),
	);
	process.once("unhandledRejection", (reason) =>
		exitHandler(
			logger,
			"unhandledRejection",
			reason instanceof Error ? reason : new Error(String(reason)),
		),
	);

	// 普通的 exit 处理器在测试环境也运行（某些测试运行器需要）
	process.on("exit", (code) => {
		const isTestEnv = process.env.NODE_ENV === "test";
		if (!isTestEnv) {
			console.log(`进程结束，代码: ${code}。日志应该已刷新。`);
		}
		// 由于某些测试会断言退出码，仅尝试刷新日志
		try {
			logger.flush();
		} catch (e) {
			/* 退出时忽略刷新错误 */
		}
	});
}
