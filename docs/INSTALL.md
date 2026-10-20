# 安装：两种电脑插件，二选一

[返回首页](../README.md) · [功能与操作图解](USAGE.md)

先安装 DSH，再从 [Releases](https://github.com/Seren-715/dsh-remote-groups/releases) 选择一个电脑包。两种电脑包均使用同一个 `dsh-remote-groups-build61.apk`（Android 8.0+ / ARM64）。已装 build61 手机端无需重装。

| 电脑现状 | 安装哪个包 | 原插件怎么处理 |
| --- | --- | --- |
| 没装过两个上游 | `dsh-remote-groups-0.1.0-preview.4.tgz` 完整版 | 无需另装上游 |
| 已有 Remote、Bot，或两者 | `dsh-remote-groups-companion-0.1.0-preview.4.tgz` 配套版 | 保留安装；标准运行入口由配套版停用 |
| 已在用本项目完整包 | 更新完整版 | 不再安装配套版 |

两种版本共享相同增强组件与功能，体积接近。手机转发、附件与本地 Agent 群聊依赖修改过的组件内部接口，所以配套版同样携带增强组件，不能只加载任意原版上游。两种版本不能同时启用。

## 新用户：完整版

推荐在 DSH → 添加插件中直接输入 `dsh-remote-groups`，安装并启用后正常重启。完整版已发布到 [npm](https://www.npmjs.com/package/dsh-remote-groups)，当前默认版本 `0.1.0-preview.4`，仍属预览版；需要固定版本可填写 `dsh-remote-groups@0.1.0-preview.4`。也可以继续使用下方本地 `.tgz` 安装方式。

在 DSH → 插件 → 添加插件中选择/填写完整包本地文件，安装并启用，然后正常退出并重启 DSH。包内已包含群聊 Host、桌面群聊、Remote Host 和 Remote 设置。无需另外下载 `ds-bot`、`ds-harness-remote` 或上游 APK。

## 已有上游：配套版

1. 保留已有 `ds-bot`、`ds-harness-remote` 安装和数据。在它们之后安装并启用配套包，重启 DSH。只装了其中一个也可以，缺失组件由配套包补齐。
2. 配套包通过 DSH 官方 bundle 配置停用标准旧运行条目，使用独立 ID 加载增强组件；原安装文件不会被覆盖。标准入口：`bot / ds-bot`、`web-search-auto / ds-bot/web-search`、`ds-harness-remote / ds-harness-remote` 和对应 TUI 条目。
3. 进入配套插件设置配置 Remote、成员与群聊。默认 `DSH_HOME/bot` 和 Remote 身份目录沿用；不删除数据目录。
4. 若曾自定义 Bot 的 `home`、Remote 服务地址、CLI 设置等，在配套版组件设置中重新应用这些配置。旧配置仍属于被停用的旧入口，不会自动复制。特别是自定义 `home`，应在首次使用配套版前填回原路径。

兼容范围：标准插件 ID 和包名、上游先于配套版加载。自定义 ID、非标准入口、用户 profile 中强制 `disabled:false` 或后来重新启用/新装上游，可能绕过配套版停用层。遇到重复界面/服务时，先停用旧上游的运行入口，再正常重启；必要时在插件管理里将配套版停用后重新启用，使其排在上游之后。**本版本没有自动识别任意自定义配置或强制覆盖用户配置的能力。**

停用/移除配套版后，其配置层也会移除；仍安装且启用的上游会恢复自己的运行入口。默认 Bot 数据保留，但上游未必理解增强功能，回退前应备份数据，不承诺增强数据完全向后兼容。

## 从独立上游改用完整版

先停用旧 `ds-bot`、`ds-harness-remote`，再启用完整包并重启，保留数据目录。默认数据沿用；旧 `name` 断言不会匹配完整包相对路径，自定义配置需重填。不要同时运行完整版和旧上游。

## 连接与依赖

安装器需要联网获取普通运行依赖。两种包都不捆绑 DSH、各 Agent CLI、模型额度或登录凭据。配置 Remote 登录/主机授权后，手机登录同一连接服务并信任电脑。CLI 登录、模型、工作目录按自己的环境设置；电脑和 Host 需要保持运行。

命令行安装（将文件名换成所选版本；已有上游请先安装上游，再执行）：

```sh
dsh plugin --profile desktop add file:/absolute/path/dsh-remote-groups-companion-0.1.0-preview.4.tgz --ignore-scripts
```

## 开发与打包

先按照 [BUILD](BUILD.md) 构建组件，再在仓库根目录运行 `npm run pack:plugin` 和 `npm run pack:companion`。两包使用同一个运行文件/许可白名单；配套版只替换 bundle patch 和分发名称。无需安装时构建脚本。GitHub 根安装对应完整版；配套版请使用 Release 固定 `.tgz`。
