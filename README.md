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

群聊已有桌面窗口/历史会话复用尚未接入。不同 CLI 的能力、图片理解和可用模型取决于本机配置。手机不提供模型额度；调用消耗相应 DSH 或 CLI 账号的现有用量。

## 安装

从 [Releases](https://github.com/Seren-715/dsh-remote-groups/releases) 下载：

1. `dsh-remote-groups-build60.apk`：Android 8.0+、ARM64；应用名 **DSH Remote Groups**。可以覆盖同签名 Groups 旧版，与上游 Remote 独立安装。
2. `ds-bot-0.1.7-mobile.20261020.1.tgz`：在电脑 DSH 插件管理中使用本地文件安装。包名仍为 `ds-bot`，会替换同名上游版本；提示重启时正常退出并重开 DSH。
3. 电脑同时需要安装并启用 Remote 连接插件；已有兼容的 `ds-harness-remote` 可继续使用。本仓库保留其源码于 `remote/`。
4. 配置各 CLI 的登录和模型，在电脑创建成员及群聊、设置工作目录。手机登录 Remote、信任并连接电脑，然后打开「群聊」。电脑和 Host 需要保持运行。

发布附件中的许可证和第三方声明随安装包一并提供；再分发时请保留。

## 源码结构与开发

| 目录 | 内容 | 许可 |
| --- | --- | --- |
| `remote/` | Remote 插件、Android 客户端及共享协议 | MIT；`vendor/ds-bot` 为 Apache-2.0 |
| `host/` | DS Bot 群聊 Host、客户端与上游桌面应用源码 | Apache-2.0；保留其第三方 NOTICE |
| `docs/` | 整合说明、来源和验证范围 | Apache-2.0 |

两套工程保留独立依赖与锁文件。见 [构建说明](docs/BUILD.md)、[变更与验证](docs/VERIFICATION.md)、[上游来源](docs/UPSTREAM.md)。本仓库不包含用户数据、登录凭据、模型密钥或 APK 签名私钥。

当前为预览版本。build 60 已通过 Android 原生模拟器中的发送和布局回归；物理手机的网络、厂商字体、文档选择器及真实 Agent 回复需按使用环境验证。
