# 安装：一个电脑插件 + 一个手机 APK

先安装 DSH。然后只需要从本项目的 [Releases](https://github.com/Seren-715/dsh-remote-groups/releases) 下载两个文件：

1. 电脑：`dsh-remote-groups-0.1.0-preview.3.tgz`。在 DSH → 插件 → 添加插件中选择/填写这个本地文件，安装并启用，按提示正常重启 DSH。
2. 手机：`dsh-remote-groups-build61.apk`。Android 8.0+ / ARM64，直接安装；旧 Groups 版本可覆盖安装。

合并插件已经包含群聊 Host、群聊桌面界面、Remote Host 和 Remote 桌面设置。**无需另外下载或安装 `ds-bot`、`ds-harness-remote` 或上游 APK。** 安装器仍需要联网获取普通运行依赖；本项目不捆绑 DSH 或各 Agent CLI。

重启后，在插件列表的 **dsh-remote-groups** 设置中配置 Remote 登录/主机授权；手机登录同一连接服务并信任电脑。模型、CLI 登录、工作目录仍需按自己的环境设置。电脑保持运行。安装一个包不等于附送模型额度或自动安装 Codex/Claude/OpenCode/Hermes。

## 已安装旧版两个插件的人

这是一次性迁移：

1. 在 DSH 插件管理里停用旧的 **ds-bot** 和 **ds-harness-remote**；不要删除 Bot 数据目录，也不要选择清除插件数据。
2. 安装并启用合并包 **dsh-remote-groups**，正常退出并重启 DSH。
3. 确认群聊、成员和 Remote 设置正常后，可移除两个旧插件安装包。以后只更新合并包。

合并版沿用 `DSH_HOME/bot` 数据目录、Remote 身份目录和原有行配置标识。若旧版手工配置含 `name: ds-bot` 或 `name: ds-harness-remote` 断言，该断言不会匹配合并包内的相对路径；请在合并插件设置中重新应用对应设置。尤其使用自定义 Bot 数据目录时，应在合并组件中指定原来的 `home`，不要把新建空目录当成数据丢失。更换 DSH profile 或删除数据目录仍会影响所看到的数据。**不要同时启用旧版和合并版**，否则会重复注册群聊/连接服务。

命令行等价安装（Desktop profile）：

```sh
dsh plugin --profile desktop add file:/absolute/path/dsh-remote-groups-0.1.0-preview.3.tgz --ignore-scripts
```

旧版 CLI 用户可先在 DSH 停止后，用官方 `dsh plugin --profile desktop remove ds-bot ds-harness-remote` 移除旧安装，再添加合并包。移除包与删除 `DSH_HOME/bot` 数据是两回事；请保留数据。

## 开发与打包

源码仍按 `remote/`、`host/` 分开维护；发布时根包的 `files` 白名单包含两边已构建的运行文件、客户端、manifest 和许可，`plugin/cordis.patch.yml` 使用官方相对路径加载。无需用户运行构建或安装脚本。

先按照 [BUILD](BUILD.md) 构建/校验两套工程，然后在仓库根目录执行 `npm run pack:plugin`。根包中的普通依赖由 DSH 插件管理器安装。GitHub 根安装也使用这个相同 manifest；推荐使用 Release 的固定 `.tgz`。
