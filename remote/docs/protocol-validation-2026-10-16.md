# WSL 协议与 Relay 安全验证

日期：2026-10-16。基线：`ad48781`，包含 TODO 更新 PR #121。

## 范围

本轮核对协议第 4–14、22–26 节与共享 schema。
核对范围包括账号注册、Control、Connect、Noise、Relay、错误码与限制。
本轮运行本地 Server、真实 WebSocket 和 Noise IK。
本轮不修改业务实现或跨仓库 fixtures。
本报告不是第三方安全审查结论。

## 环境与命令

- WSL2：Linux `6.18.54.1-microsoft-standard-WSL2`。
- Node.js：`22.17.1`。本机默认版本是 `24.15.0`。
- pnpm：`9.15.4`。
- Server 只监听 `127.0.0.1` 随机端口。
- 测试使用临时账号、临时设备和合成消息。
- 测试结束后清理连接、Noise 对象与临时凭据目录。

使用 Node.js 22 运行以下命令：

```bash
pnpm --filter @dsh-remote/protocol build
pnpm --filter @dsh-remote/crypto build
pnpm --filter @dsh-remote/webrtc build
pnpm --filter @dsh-remote/client-core build
pnpm --filter @dsh-remote/protocol check
pnpm --filter @dsh-remote/server check
pnpm --filter @dsh-remote/protocol test
pnpm --filter @dsh-remote/crypto test
pnpm --filter @dsh-remote/server test
pnpm --filter ds-harness-remote exec vitest run tests/client-secure-transport.test.ts tests/server-connection.test.ts
pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --esModuleInterop apps/server/tests/server.test.ts
git diff --check
```

沙箱默认禁止本机监听端口。Server 测试通过授权后在沙箱外运行。

## 验证结果

| 项目 | 结果 | 边界 |
| --- | --- | --- |
| Protocol | 7 文件 / 78 契约测试通过 | 包含现有共享 conformance fixtures |
| Crypto | 3 文件 / 7 契约测试通过 | 包含固定 Noise IK golden vector |
| Server | 1 文件 / 12 契约测试通过 | 使用真实本机 HTTP/WebSocket |
| Plugin 相关回归 | 2 文件 / 13 契约测试通过 | Client 安全通道与 Host Server 连接 |
| 类型检查 | Protocol、Server 与 Server 测试通过 | 不代表全仓检查通过 |
| 共享包构建 | Protocol、Crypto、WebRTC、client-core 通过 | 不包含 Plugin Bundle |

Plugin 检查缺少 `@xterm/headless` 和 `@xterm/addon-serialize`。
共享包递归构建在 Plugin 阶段失败。
本轮还原构建产生的 Bundle 变动，不记录全仓 build/check 通过。

## Relay 场景

测试实现见 [`apps/server/tests/server.test.ts`](../apps/server/tests/server.test.ts)。
新增场景使用原有 setup/teardown，场景之间重建 Server 与设备。
场景执行器汇总失败名称，并继续执行同组场景。

| 契约 | 场景 | 结果 |
| --- | --- | --- |
| WebSocket 边界 | 不支持的版本、binary、Control 超限、未知类型 | Server 返回错误并关闭设备连接 |
| Relay 路由 | 错误 target、第三设备、未知 connection、握手未完成 | Server 拒绝转发 |
| 密文完整性 | 修改 AEAD tag | 生产 Client 安全通道关闭，不交付消息 |
| 密文重放 | 重用密文，提高外层 counter | Server 转发后，生产 Client 拒绝并关闭通道 |
| 身份绑定 | responder 固定另一静态公钥 | Noise 拒绝握手，不进入 transport 状态 |
| 连接绑定 | responder 使用另一 connection prologue | Noise 拒绝握手，不进入 transport 状态 |

密文完整性与重放场景使用生产 `RelayTransport` 和 `ClientSecureTransport`。
测试先检查接收字节增量，再断言断线状态。
增量必须等于测试密文长度。
该断言排除 Server 提前拒绝造成的断线假阳性。
测试同时验证客户端发送请求与 Host 返回消息。
通道失败后，Client 不能继续发送消息。
Host Control socket 仍能响应 ping。

身份与 prologue 场景使用测试 Host 的真实 `NoiseIkSession`。
这些场景不等于完整 Host runtime 的 membership 与 trust store 验收。
现有重复外层 counter 测试继续验证 Server 排序拒绝。
提高外层 counter 的场景另行验证 Noise nonce 状态。

测试验证密文传输与端点解密行为。
单纯检查密文不含明文字符串，不能证明 Server 无法解密。
本轮不宣称完成全部加密安全验收。

## Schema 核对

实现入口：[`packages/protocol/src/index.ts`](../packages/protocol/src/index.ts)。
协议依据：[`protocol.md`](protocol.md)。

| 协议范围 | 当前覆盖 | 剩余差距 |
| --- | --- | --- |
| 第 7–9 节：设备与授权 | 严格 descriptor、token 字节限制、匹配码、refresh schema | 多账号隔离需独立 Server 验证 |
| 第 10 节：Control | 全部已定义 frame 有 payload schema，envelope 严格 | JSON 重复字段检查与标识符格式不完整 |
| 第 11 节：Connect | account literal、transport enum 与必需字段 | `clientIdentityKey` 只要求非空字符串 |
| 第 12–13 节：Handshake/Relay | counter 安全整数、frame 字节限制 | Base64URL 规范形式与握手 step 上限未在共享 schema 约束 |
| 第 14 节：Signaling | SDP、ICE 与 transport enum | 本轮不验证真实 NAT、TURN 或网络切换 |
| 第 22–24 节：错误与限制 | 扩展错误码、协商帧大小与默认限制测试 | heartbeat 数值上限与 RTT 尚需核定 |

以下输入通过当前共享解析器。本轮仅用临时探针确认，不增加错误行为断言。

| 输入 | 当前结果 | 后续任务 |
| --- | --- | --- |
| 原始 JSON 同时包含 `"v":2` 和 `"v":1` | `decodeControlFrame` 接受最后一个值 | 定义并拒绝重复安全字段 |
| Relay ciphertext 为 `AQIDBA==` | 接受 padding | 校验规范无 padding Base64URL |
| `clientIdentityKey` 为 `not-a-key` | `parseControlFrame` 接受 | 复用设备公钥格式校验 |
| `secure.handshake.step` 为 `3` | 共享解析器接受 | 明确固定 IK 的 step 范围 |
| `heartbeatIntervalMs` 为 `9007199254740992` | 共享解析器接受 | 定义安全整数与实现可用的上限 |
| 非空扩展错误码 `TEST_EXTENSION` | 接受 | 符合第 23 节，无需改成固定 enum |

这些结果只证明共享解析器的输入行为。
它们不等于已证明的远程授权绕过。
最小 Server 使用已注册设备的公钥，且按连接状态检查握手顺序。
Plugin Host 还交叉检查设备详情与 pinned peer。
后续修复需分别验证共享解析器和入口行为。

其他文档差距：第 22 节同时写入移除和使用 `connection.ping`。
第 24 节与第 26 节仍包含 replay/rekey 目标。
这些目标不能作为已完成能力。

## 后续范围

- 优先修复重复安全字段、公钥格式和 Base64URL 输入校验。
- 同步协议说明、共享 schema 与跨仓库 fixtures。
- 核对 REST 原始 UTF-8/JSON 处理与标识符兼容范围。
- 单独核对 Harness Typert RPC、stream 和 transfer 生命周期。
- 补充生产 Host runtime 的加密跨设备验证。
- 另行完成 rekey、密钥清理与第三方安全审查。
- 另行完成 Android 原生、Windows、NAT 与长连接验收。

本轮不将 TODO 的协议对齐或真实跨设备安全任务整体勾选。
