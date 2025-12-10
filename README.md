# MCP ts-morph 重构工具

## 概述

此 MCP 服务器利用 [ts-morph](https://ts-morph.com/) 为 TypeScript 和 JavaScript 代码库提供重构操作。
它可以与 Cursor 等编辑器扩展协同工作，基于 AST (抽象语法树) 执行符号重命名、文件/文件夹重命名、查找引用等操作。

## 提供的功能

此 MCP 服务器提供以下重构功能。每个功能都使用 `ts-morph` 解析 AST，并在保持项目整体一致性的同时进行修改。

### 符号重命名 (`rename_symbol_by_tsmorph`)

- **功能**: 在整个项目中批量更改指定文件中特定位置的符号（函数、变量、类、接口等）的名称。
- **使用场景**: 当需要更改函数名或变量名，但引用处较多，手动更改困难时。
- **所需信息**: 项目的 `tsconfig.json` 路径、目标文件路径、符号位置（行、列）、当前符号名、新符号名

### 文件/文件夹重命名 (`rename_filesystem_entry_by_tsmorph`)

- **功能**: 重命名指定的**多个**文件和/或文件夹，并自动更新项目内所有 `import`/`export` 语句的路径。
- **使用场景**: 当需要更改文件结构并相应修正 import 路径时。当需要一次性重命名/移动多个文件/文件夹时。
- **所需信息**: 项目的 `tsconfig.json` 路径、重命名操作数组 (`renames: { oldPath: string, newPath: string }[]`)。
- **备注**:
    - 引用解析主要使用符号分析。
    - 包含路径别名（如 `@/`）的引用会被更新，但**会转换为相对路径**。
    - 引用目录索引文件的导入（例如: `../components`）会**更新为明确的文件路径（例如: `../components/index.tsx`）**。
    - 重命名操作前会进行路径冲突检查（现有路径或操作内的重复）。
- **注意（执行时间）:** 当一次性操作大量文件或文件夹，或在非常大的项目中，引用解析和更新可能需要较长时间。
- **注意（已知限制）:** 目前，`export default Identifier;` 形式的默认导出引用可能无法正确更新。

### 查找引用 (`find_references_by_tsmorph`)

- **功能**: 查找指定文件中特定位置符号的定义位置，以及在整个项目中的所有引用位置并列出。
- **使用场景**: 当需要了解某个函数或变量在哪里被使用时。当需要调查重构的影响范围时。
- **所需信息**: 项目的 `tsconfig.json` 路径、目标文件路径、符号位置（行、列）。

### 移除路径别名 (`remove_path_alias_by_tsmorph`)

- **功能**: 将指定文件或目录内 `import`/`export` 语句中包含的路径别名（如 `@/components`）替换为相对路径（如 `../../components`）。
- **使用场景**: 当需要提高项目可移植性时，或需要符合特定编码规范时。
- **所需信息**: 项目的 `tsconfig.json` 路径、要处理的文件或目录路径。

### 符号跨文件移动 (`move_symbol_to_file_by_tsmorph`)

- **功能**: 将指定的符号（函数、变量、类、接口、类型别名、枚举）从当前文件移动到指定的另一个文件。移动时会自动更新整个项目的引用（包括导入/导出路径）。
- **使用场景**: 当需要更改代码结构，将特定功能提取到另一个文件时。
- **所需信息**: 项目的 `tsconfig.json` 路径、源文件路径、目标文件路径、要移动的符号名称。必要时可指定符号类型（`declarationKindString`）以消除同名符号的歧义。
- **备注**: 符号的内部依赖关系（仅在该符号内使用的其他声明）也会一起移动。源文件中其他符号也引用的依赖关系会保留在源文件中，必要时会添加 `export`，并在目标文件中导入。
- **注意**: 默认导出（`export default`）的符号无法使用此工具移动。

## 环境配置

### 用户使用（作为 npm 包使用）

在 `mcp.json` 中添加以下配置。使用 `npx` 命令会自动使用已安装的最新版本。

```json
{
  "mcpServers": {
    "mcp-tsmorph-refactor": { // 任意のサーバー名
      "command": "npx",
      "args": ["-y", "@sirosuzume/mcp-tsmorph-refactor"],
      "env": {} // 必要に応じてロギング設定などを追加
    }
  }
}
```

### 开发者使用（本地开发和运行）

当需要从源代码在本地启动服务器时，首先需要构建。

```bash
# 安装依赖（仅首次）
pnpm install

# 构建 TypeScript 代码
pnpm run build
```

构建后，在 `mcp.json` 中进行以下配置，即可用 `node` 直接执行。

```json
{
  "mcpServers": {
    "mcp-tsmorph-refactor-dev": { // 開発用など、別の名前を推奨
      "command": "node",
      // 从项目根目录的相对路径或绝对路径
      "args": ["/path/to/your/local/repo/dist/index.js"],
      "env": {
        // 开发时的调试日志设置等
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### 日志配置（环境变量）

服务器的运行日志可以通过以下环境变量控制输出级别和输出目标。在 `mcp.json` 的 `env` 块中设置。

-   `LOG_LEVEL`: 设置日志详细程度。
    -   可用级别: `fatal`, `error`, `warn`, `info`（默认）, `debug`, `trace`, `silent`
    -   示例: `"LOG_LEVEL": "debug"`
-   `LOG_OUTPUT`: 指定日志输出目标。
    -   `console`（默认）: 输出日志到标准输出。在开发环境（`NODE_ENV !== 'production'`）且安装了 `pino-pretty` 时，会以易读格式输出。
    -   `file`: 输出日志到指定文件。当需要避免影响 MCP 客户端时设置。
    -   示例: `"LOG_OUTPUT": "file"`
-   `LOG_FILE_PATH`: 当 `LOG_OUTPUT` 为 `file` 时，指定日志文件的绝对路径。
    -   默认: `[项目根目录]/app.log`
    -   示例: `"LOG_FILE_PATH": "/var/log/mcp-tsmorph.log"`

配置示例（在 `mcp.json` 中）:

```json
// ... (mcp.json 的其他配置)
      "env": {
        "LOG_LEVEL": "debug", // 输出调试级别的日志
        "LOG_OUTPUT": "file",  // 输出到文件
        "LOG_FILE_PATH": "/Users/yourname/logs/mcp-tsmorph.log" // 指定日志文件路径
      }
// ...
```

## 开发者信息

### 前置条件

- Node.js（版本参考 `.node-version` 或 `package.json` 的 `volta` 字段）
- pnpm（版本参考 `package.json` 的 `packageManager` 字段）

### 设置

克隆仓库并安装依赖。

```bash
git clone https://github.com/sirosuzume/mcp-tsmorph-refactor.git
cd mcp-tsmorph-refactor
pnpm install
```

### 构建

将 TypeScript 代码编译为 JavaScript。

```bash
pnpm build
```

构建产物会输出到 `dist` 目录。

### 测试

运行单元测试。

```bash
pnpm test
```

### 代码检查和格式化

对代码进行静态分析和格式化。

```bash
# 代码检查
pnpm lint

# 修复代码检查问题
pnpm lint:fix

# 格式化
pnpm format
```

### 使用调试包装器

在开发过程中，如需详细查看 MCP 服务器的启动序列、标准输入输出和错误输出，可以使用项目 `scripts` 目录中的 `mcp_launcher.js`。

此包装器脚本会将原始 MCP 服务器进程（`npx -y @sirosuzume/mcp-tsmorph-refactor`）作为子进程启动，并将其启动信息和输出记录到项目根目录的 `.logs/mcp_launcher.log` 文件中。

**使用方法:**

1.  在 `mcp.json` 文件中，将 `mcp-tsmorph-refactor` 服务器的配置更改如下。
    *   将 `command` 改为 `"node"`。
    *   在 `args` 中指定 `scripts/mcp_launcher.js` 的路径（例如: `["path/to/your_project_root/scripts/mcp_launcher.js"]`）。也可以使用从项目根目录的相对路径（`["scripts/mcp_launcher.js"]`）。

    配置示例（`mcp.json`）:
    ```json
    {
      "mcpServers": {
        "mcp-tsmorph-refactor": {
          "command": "node",
          // scripts/mcp_launcher.js 的路径（从项目根目录的相对路径或绝对路径）
          "args": ["path/to/your_project_root/scripts/mcp_launcher.js"],
          "env": {
            // 原有的环境变量设置可以保留
            // 例如:
            // "LOG_LEVEL": "trace",
            // "LOG_OUTPUT": "file",
            // "LOG_FILE_PATH": ".logs/mcp-ts-morph.log"
          }
        }
        // ... 其他服务器配置 ...
      }
    }
    ```

2.  重启或重新加载 MCP 客户端（例如: Cursor）。

3.  确认日志输出到项目根目录的 `.logs/mcp_launcher.log`。
    此外，如果配置了 MCP 服务器自身的日志（例如: `.logs/mcp-ts-morph.log`），也可以查看。

使用此包装器有助于排查 MCP 服务器未能按预期启动的原因。

## 发布到 npm

此包通过 GitHub Actions 工作流（`.github/workflows/release.yml`）自动发布到 npm。

### 前置条件

*   NPM Token: 确保具有发布权限的 npm 访问令牌已在仓库的 Actions secrets（`Settings` > `Secrets and variables` > `Actions`）中设置为 `NPM_TOKEN`。
*   版本更新: 发布前，请按照语义化版本（SemVer）更新 `package.json` 的 `version` 字段。

### 发布方法

使用 Git 标签推送来触发发布工作流。

**方法: Git 标签推送（发布时推荐）**

*   **预期用途:** 常规版本发布（主版本、次版本、补丁版本）。因 Git 历史记录与版本明确对应，推荐作为标准发布流程。

1.  更新版本: 修改 `package.json` 的 `version`（例如: `0.3.0`）。
2.  提交并推送: 提交 `package.json` 的更改并推送到 main 分支。
3.  创建并推送标签: 创建与版本匹配的 Git 标签（带 `v` 前缀）并推送。
    ```bash
    git tag v0.3.0
    git push origin v0.3.0
    ```
4.  自动化: 推送标签会触发 `Release Package` 工作流，执行包的构建、测试和发布到 npm。
5.  确认: 在 Actions 标签页查看工作流状态，并在 npmjs.com 确认包已发布。

### 注意事项

*   版本一致性: 通过标签推送触发时，标签名（例如: `v0.3.0`）必须与 `package.json` 的 `version`（例如: `0.3.0`）**完全匹配**。不匹配时，工作流会失败。
*   预先检查: 虽然 CI 工作流包含构建和测试步骤，但建议在更新版本前先在本地运行 `pnpm run build` 和 `pnpm run test`，以便尽早发现潜在问题。

## 许可证

此项目基于 MIT 许可证发布。详情请参阅 [LICENSE](LICENSE) 文件。