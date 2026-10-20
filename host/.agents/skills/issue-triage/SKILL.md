---
name: issue-triage
description: 给 DS Bot 仓库的 Issue 和 PR 分诊：打类型、优先级、领域标签，判断该关闭、追问、转讨论还是留着做，并把结论写回 GitHub。触发词：分诊、整理 Issue、打标签、打优先级、这个该不该关、追问报告人、needs-info 到期。
---

# Issue 分诊

目标：每个 Open Issue 都有**一个类型、一个优先级**，需要时有一个领域；每个关闭的 Issue 都有**证据**。

标签的含义和流程以 [CONTRIBUTING.zh.md](../../../CONTRIBUTING.zh.md#协作方式) 为准，本文只写怎么做。

**边界**：只动 Issue、PR 的标签、评论和关闭状态。不改代码，不改 Issue 正文，不合并 PR。带 `maintainer` 的条目只分诊、不下结论。

## 1. 取快照

在仓库根目录运行（只读，不写 GitHub）：

```sh
node .agents/skills/issue-triage/scripts/snapshot.mjs --out /tmp/triage
```

先读 `digest.md` 再判断，不要只看标题。digest 把每个 Issue 列成：标签、天数、评论数、正文和别人评论的摘要、`dev`/`main` 上引用它的提交、引用它的 Open PR。最上面是**待处理**：

- 没有类型或没有优先级的
- 有两个优先级的
- `needs-info` 超过 14 天、报告人没再回复的

动手之前读一遍 [references/gh-gotchas.md](references/gh-gotchas.md)。

## 2. 分类

每条落三个坐标：

| 坐标 | 取值 | 怎么判 |
|---|---|---|
| 类型 | `bug` · `enhancement` · `documentation` | 行为和设计不一致才是 `bug`。设计本来就这样、用户想要别的，是 `enhancement`。拿不准时先读 [docs/vision.zh.md](../../../docs/vision.zh.md) 和 [docs/plans/](../../../docs/plans/) |
| 优先级 | `P0`–`P3` | `P0` 崩溃、丢数据、完全不能用 · `P1` 影响日常使用、刚引入的回归 · `P2` 普通 bug 或功能 · `P3` 建议、窄场景 |
| 领域 | `area/*` 之一 | 按改动会落在哪个目录判。跨好几个领域或不属于任何领域，就不挂 |

规则：

- **已有的优先级默认保留**。那是之前的判断，不是噪声。觉得该改，在评论里说理由。
- **一个 Issue 只有一个 P 标签**。`--add-label` 不会去掉旧的，改优先级要同时 `--remove-label`。
- PR 不打类型和领域。

## 3. 判动作

按证据归组。**证据不够就留着做**，不要猜着关。

| 组 | 判据 | 动作 |
|---|---|---|
| 已修，未发版 | `dev` 上有提交或已合并的 PR 修了它 | 不关。评论写明 PR 号，等发版时 Release PR 的 `Fixes #N` 自动关 |
| 已修，已发版 | `main` 上有修复，CHANGELOG 有记录，或能指出守住它的测试 | `completed` 关，评论写具体的 PR、提交或测试名 |
| 重复 | 和另一个 Issue 是同一个原因 | 加 `duplicate`，链接那一个，`not planned` 关 |
| 上游 | 原因在 DSH 或别的插件 | 加 `upstream`，链接该去的地方。我们这边无事可做时 `not planned` 关 |
| 提问 | 怎么装、怎么用 | 在网页上 **Convert to discussion**，转到 Q&A（CLI 做不了，见 gotchas） |
| 缺信息 | 现象定位不了，没有版本、日志或复现步骤 | 加 `needs-info`，追问一次（模板见下） |
| `needs-info` 到期 | 追问后 14 天没有新信息 | `not planned` 关，评论写「没有收到补充信息，补充后会重新打开」 |
| 有 PR 在做 | 有 Open PR 引用它 | 不动 |
| 需要方向 | 涉及产品方向、已定设计、协作规则、发版、架构 | 加 `maintainer`，等维护者 |
| 留着做 | 其余 | 打好标签就行。小而清楚的可以加 `good first issue` |

## 4. 写评论和关闭

- **用 Issue 自己的语言**：正文是中文就用中文，否则用英文。
- 关闭的评论必须是「为什么可以关」的证据：PR 号、提交号、文件和测试名、重复的 Issue 号、报告人自己的更正。
- 一条命令完成关闭和评论：`gh issue close <n> --reason "completed" --comment-file <file>` 或 `--reason "not planned"`。
- 中文评论先写进 UTF-8 文件，再用 `--body-file` 或 `--comment-file` 发。

追问模板（按情况删改，写清楚**缺什么**）：

```text
感谢反馈。为了找到原因，请补充：
1. DS Bot 和 DSH 的版本。
2. ……（具体缺的东西）
3. ……

14 天内没有新信息，我们会先关闭这个 Issue；补充后我们会重新打开。
```

## 5. 回读自查

写回之后再拉一次，确认：

```sh
gh issue list --state open --limit 300 --json number,labels --jq '.[] | select([.labels[].name | select(test("^P[0-3]$"))] | length != 1) | .number'
gh issue list --state open --limit 300 --json number,labels --jq '.[] | select([.labels[].name | select(. == "bug" or . == "enhancement" or . == "documentation")] | length == 0) | .number'
```

两条都没有输出才算完成。

## 6. 汇报

向提出请求的人汇报一张表：编号、标题、打了什么标签、动作、证据。关闭和追问在执行前先给对方看；对方确认后再发。
