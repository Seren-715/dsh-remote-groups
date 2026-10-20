# DSH Remote Groups

[English](README.en.md) · [下载预览版](https://github.com/Seren-715/dsh-remote-groups/releases) · [许可与来源](LICENSES.md)

将 Android 手机连接电脑与多 Agent 群聊整合在一起。电脑运行 DSH 和 Agent，手机用于发送消息、查看工作状态、处理审批及上传图片/文件。

这是 Seren-715 维护的社区衍生版本，基于 [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) 和 [DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)。不是上述项目或 DeepSeek、OpenAI、Anthropic 的官方发布。

## 当前功能

- 与电脑共用群聊、成员、历史消息和工作状态。
- DSH、Codex CLI、Claude Code、OpenCode、Hermes 成员；`@成员` 指定接收者，也可设置有发言次数上限的自动讨论。
- 群聊专用会话、成员管理、主持人、工作目录、单次审批与停止任务。
- 图片/文件上传与历史附件读取，长消息折叠和分段加载。
- 深浅色界面、桌面同源头像与 Android 原生群聊页面。
- 群名下方固定审批卡、长按头像 @、输入框上方 @ 候选及按账户/电脑/群隔离的持久文本草稿。

新消息和审批不会强制滚动打断历史阅读，使用「回到最新」按钮主动定位。图片识别辅助信息保留给模型，聊天只显示用户原文和图片。

群聊已有桌面窗口/历史会话复用尚未接入。不同 CLI 的能力、图片理解和可用模型取决于本机配置。手机不提供模型额度；调用消耗相应 DSH 或 CLI 账号的现有用量。

## 安装

安装 DSH 后，只需从 [Releases](https://github.com/Seren-715/dsh-remote-groups/releases) 下载：

1. **电脑插件** `dsh-remote-groups-0.1.0-preview.3.tgz`：在 DSH 插件管理中安装、启用，按提示重启。已包含 Remote 连接与群聊功能，无需另外安装两个上游插件。
2. **手机 APK** `dsh-remote-groups-build61.apk`：Android 8.0+、ARM64；应用名 DSH Remote Groups，同签名旧版可覆盖安装。

然后在合并插件设置中登录/授权 Remote，在电脑配置各 CLI 的登录、模型、成员和群聊；手机登录、信任并连接电脑后进入群聊。安装时需要联网获取运行依赖，电脑和 Host 需保持运行。

**旧版用户：先停用 `ds-bot` 和 `ds-harness-remote`，再启用合并包，避免重复加载；保留数据目录。** 详细步骤和数据迁移范围见 [安装说明](docs/INSTALL.md)。

发布附件中的许可证和第三方声明随安装包一并提供；再分发时请保留。

## 源码结构与开发

| 目录 | 内容 | 许可 |
| --- | --- | --- |
| `remote/` | Remote 插件、Android 客户端及共享协议 | MIT；DS Bot 衍生模块为 Apache-2.0 |
| `host/` | DS Bot 群聊 Host、客户端与上游桌面应用源码 | Apache-2.0；保留其第三方 NOTICE |
| `docs/` | 整合说明、来源和验证范围 | Apache-2.0 |

两套工程保留独立依赖与锁文件。见 [构建说明](docs/BUILD.md)、[变更与验证](docs/VERIFICATION.md)、[上游来源](docs/UPSTREAM.md)。本仓库不包含用户数据、登录凭据、模型密钥或 APK 签名私钥。

当前为预览版本。build 61 已通过 Android 原生模拟器中的发送和布局回归；物理手机的网络、厂商字体、文档选择器及真实 Agent 回复需按使用环境验证。
