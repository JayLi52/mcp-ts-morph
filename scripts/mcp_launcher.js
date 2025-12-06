const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// --- 设置 ---
// 日志文件输出位置（请按需修改）
const LOG_FILE_PATH = path.resolve(__dirname, "../.logs/mcp_launcher.log");
// 实际执行的命令与参数
const ACTUAL_COMMAND = "npx";
const ACTUAL_ARGS = ["-y", "@sirosuzume/mcp-tsmorph-refactor"];
// --- 设置到此结束 ---

function ensureLogDirectoryExists(filePath) {
	const dirname = path.dirname(filePath);
	if (fs.existsSync(dirname)) {
		return true;
	}
	fs.mkdirSync(dirname, { recursive: true });
}

function logToFile(message) {
	try {
		ensureLogDirectoryExists(LOG_FILE_PATH);
		const timestamp = new Date().toISOString();
		fs.appendFileSync(LOG_FILE_PATH, `[${timestamp}] ${message}\n`);
	} catch (error) {
// 写入日志文件失败时输出到控制台（但 MCP 客户端可能不可见）
		console.error("Failed to write to launcher log file:", error);
	}
}

logToFile("Launcher script started.");
logToFile(`CWD: ${process.cwd()}`);
logToFile(`Executing: ${ACTUAL_COMMAND} ${ACTUAL_ARGS.join(" ")}`);

const child = spawn(ACTUAL_COMMAND, ACTUAL_ARGS, {
	stdio: ["pipe", "pipe", "pipe"], // 通过管道连接 stdin、stdout、stderr
	shell: process.platform === "win32", // 在 Windows 上有时 shell: true 更稳定
});

logToFile(`Spawned child process with PID: ${child.pid}`);

// 将子进程的标准输出同时写入包装器的标准输出和日志文件
child.stdout.on("data", (data) => {
	process.stdout.write(data); // 输出到 MCP 客户端
	logToFile(`[CHILD STDOUT] ${data.toString().trim()}`);
});

// 将子进程的标准错误输出同时写入包装器的标准错误输出和日志文件
child.stderr.on("data", (data) => {
	process.stderr.write(data); // 输出到 MCP 客户端（作为错误）
	logToFile(`[CHILD STDERR] ${data.toString().trim()}`);
});

// 将父进程的标准输入传给子进程
process.stdin.pipe(child.stdin);

child.on("error", (error) => {
	logToFile(`Failed to start child process: ${error.message}`);
	process.exit(1); // 发生错误时退出
});

child.on("close", (code, signal) => {
	logToFile(`Child process closed with code ${code}, signal ${signal}`);
});

child.on("exit", (code, signal) => {
	logToFile(`Child process exited with code ${code}, signal ${signal}`);
	process.exitCode = code ?? 1; // 親プロセスの終了コードを設定
});

process.on("exit", (code) => {
	logToFile(`Launcher script exiting with code ${code}.`);
});
