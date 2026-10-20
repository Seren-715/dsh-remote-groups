# gh 和 GitHub 的坑

分诊时踩过的，动手前读一遍。

## 标签

- `gh issue edit --add-label P2` **不会**去掉原来的 `P3`。改优先级要写成 `--add-label P2 --remove-label P3`，改完按 SKILL 第 5 步回读。
- 标签名区分大小写，`p1` 和 `P1` 是两个标签。只用已有的标签，不要临时新建。

## 关闭

- `Fixes #N` 只在 PR 合进**默认分支 `main`** 时生效。合进 `dev` 的修复不会关 Issue，这是故意的：Issue 开着表示「`dev` 已修，等发版」。发版的 PR 要在正文里列出这一批所有的 `Fixes #N`。
- 关闭原因只有两种：`completed`（修好了、答复了）和 `not planned`（重复、上游、不做、缺信息到期）。`gh issue close` 的 `--reason` 要加引号：`--reason "not planned"`。

## 转讨论

- **Convert to discussion 只能在网页上点**。REST 和 `gh` 都没有这个操作。分诊时把要转的 Issue 列出来，请有写权限的人在 Issue 页面右侧栏点。
- 转走之后，原来的 Issue 号会跳转到讨论帖，评论都会带过去。

## 中文和 Windows

- 在 PowerShell 或 cmd 里直接把中文写进 `--body`、`--comment`，可能乱码或被截断。中文先写进 UTF-8 文件，再用 `--body-file` 或 `--comment-file`。
- Git Bash 会把传给 Windows 程序的 `/tmp/...` 参数改写成 `%TEMP%\...`。`snapshot.mjs --out /tmp/triage` 实际写到了 `%TEMP%\triage`；之后在 node 里读文件，要用脚本最后打印的那个路径。
- `--jq` 的字符串里不能写 `\s`、`\|` 这类转义，要写成 `[\n ]`、`[|]`。
- `gh issue list --search` 对中文标题的匹配不可靠，可能漏结果。查重复时用 `--json number,title,body` 拉全量，在本地过滤。

## 查询

- `gh issue list` 默认只返回 30 条，要加 `--limit`。
- `gh issue list --json comments` 会把全部评论拉下来，数量多时很慢；快照脚本只在需要时才这样拉。
- 在 `--jq` 里过滤标签用 `[.labels[].name]`，不要用 `.labels.name`。
