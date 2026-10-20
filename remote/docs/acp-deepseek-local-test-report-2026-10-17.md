# Pi / Claude Code ACP 本地 DeepSeek API 测试报告

**结论：最新代码上的 Pi ACP 与 Claude Code ACP 均已使用 DSH 的 DeepSeek API 凭据和 `deepseek-flash` 完成本地真实调用验证。Pi 6 项、Claude 8 项检查全部通过；Plugin 与 client-core 共 379 个自动化测试通过。无业务源码修复，无用户持久配置变更。**

## 1. 验证范围与环境

- 日期：2026-10-17（Asia/Shanghai）。
- 仓库：`liguobao/ds-harness-remote`，分支 `main`。
- 使用 `git pull --ff-only` 从 `b02e468` 更新至 `f660ba4fe309175b466991edeb9e2d46fe989625`；验证时与 `origin/main` 一致。此次新增提交主要调整 Android 导航。
- 平台：Linux x86_64，内核 6.8.0-138-generic；Node.js v22.23.0；pnpm 9.15.4。
- Remote Plugin：0.5.9；Pi：1.3.0；pi-acp：0.0.34；Claude ACP：`@agentclientprotocol/claude-agent-acp@0.91.0`（npm exec 缓存安装）。
- 凭据：复用 DSH 本机已保存的 DeepSeek API key，只在测试进程内读取和传递，不将密钥写入报告或仓库。
- 接口：`https://api.deepseek.com/anthropic`，Anthropic Messages 兼容协议。
- 主验证模型：`deepseek-flash`。另直接调用验证 `deepseek-v4-pro` 接口，返回 HTTP 200；这不代表两个 ACP 已完成该模型的全套验证。
- 不使用本机现有 GPT 兼容 provider；未修改正在运行的 DSH GUI、用户持久配置或现有项目数据。

## 2. 方法

构建当前源码后，直接加载实际 `AcpRemoteGateway`，不注入 mock adapter。通过真实 Peer API 调用 `session/new`、`session/prompt`、工作区/会话 catalog、history 和 load，观察 `agent.acp.frame`，等待 `prompt_completed`，并检查实际文本标记、工具事件及文件内容，而非只检查 prompt 被 accepted。

测试使用系统 tmp 下的独立工作区和 Pi/Claude 配置目录。读取预置 fixture，写入仅限测试目录的结果文件。Gateway 关闭后重新创建，重新发现 catalog、load 同一会话，并检查早先的随机上下文标记。

Claude 使用 `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` 与进程环境中的 key。Pi 使用独立 custom provider，`api: anthropic-messages`，API key 配置引用写为 `${DEEPSEEK_API_KEY}`，避免将变量名称当作密钥原文。

## 3. 真实调用结果

| 验证项 | Pi ACP | Claude Code ACP |
| --- | --- | --- |
| Gateway / adapter 初始化可用 | 通过 | 通过 |
| DeepSeek 流式文本回复，校验标记 | 通过 | 通过 |
| 真实文件 read 工具，校验内容 | 通过，观察到 3 个 tool call/update 帧 | 通过，观察到 4 个 tool call/update 帧 |
| 真实文件 write 工具，校验落盘 | 通过 | 通过 |
| 历史读取 | 通过 | 通过 |
| Gateway / adapter 重启后 load 并继续上下文 | 通过 | 通过 |
| 单次允许写入 | 本轮不作为 Pi 验证项 | 通过，实际出现 1 次审批请求 |
| 拒绝写入且目标文件不存在 | 本轮不作为 Pi 验证项 | 通过，实际出现 1 次审批请求，拒绝后无文件 |

Pi 默认不是逐工具审批；没有额外安装 permission extension，因此不能以本轮默认工具执行结果宣称 Pi 的人工审批链路通过。

## 4. 自动化回归与构建

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter ds-harness-remote check` | 通过 |
| `pnpm --filter ds-harness-remote test` | 通过：49 文件 / 339 tests |
| `pnpm --filter ds-harness-remote build` | 通过 |
| `node scripts/verify-dsh-plugin.mjs` | 通过 |
| `pnpm --filter @dsh-remote/client-core test` | 通过：5 文件 / 40 tests |
| `git diff --check` | 通过（报告完成前复查） |

以上合计 379 个自动化测试，属于 Plugin 和 client-core 范围；未运行全仓 Android / Server / 全量生产构建，不将此前文档基线计入本次结果。

## 5. 发现及处理

初版 Pi 隔离测试配置把 `apiKey` 写成 `DEEPSEEK_API_KEY`。Pi 1.3.0 将其当作密钥字面量，真实 API 返回 HTTP 401。进程初始化仍成功、prompt 仍能结束，因此仅检查 ready / completed 会误判可用。定位后将隔离配置改为 `${DEEPSEEK_API_KEY}` 并重新执行真实调用。这是测试配置错误，不是本次仓库源码缺陷；未修改用户的 Pi 全局配置。

首轮测试也修正了烟测代码中审批句柄的读取位置：使用 `frame.params.requestHandle`，而非外层数据字段。最终 Claude 的单次允许与拒绝均经 Host Gateway 原生审批映射完成。

已知非阻断信息：Node SQLite experimental warning；Plugin 生命周期测试中部分 mock 场景打印 legacy carrier 或本机未安装 AGY 的提示。所有对应测试通过；本次不将这些信息归为 Pi / Claude 模型失败。

## 6. 证据与边界

- Pi 最终隔离结果：[results.json](</tmp/acp-deepseek-CtQcVH/results.json>)，6 项检查均为 true；独立烟测脚本为 [acp-pi-deepseek-fixed-smoke.mjs](</tmp/acp-pi-deepseek-fixed-smoke.mjs>)。
- Claude 最终隔离结果：[results.json](</tmp/acp-deepseek-pxXsgA/results.json>)，8 项检查均为 true；工作区中允许写入的文件内容经脚本断言，拒绝目标不存在。
- 自动化结果来自本次真实命令执行，不引用历史测试数量。
- 测试未启动替代 Web 服务，没有重启或切换当前 DSH GUI；这是本地真实 Gateway + ACP + DeepSeek API 验证，**不是浏览器界面或加密跨设备 E2E**。
- 未验证 Windows、Android APK/真机、Desktop UI、独立 Remote Web、断网重连、长时间稳定性、Pi 自定义审批扩展、Thinking 切换和用户主动取消。
- Claude ACP 当前客户端工作区/历史 UI 的产品完整度不由本次 Host 验证保证；不宣称 Anthropic Claude 模型已验证，实际使用的是 DeepSeek。
- 临时目录中的会话记录是测试产物，非仓库提交文件；系统清理 tmp 后不保证继续存在。报告只保留检查结论，不保存 prompt、工具原始输出或密钥。
