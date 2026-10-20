# DSH Remote Groups

[中文](README.md) · [Downloads](https://github.com/Seren-715/dsh-remote-groups/releases/tag/v0.1.0-preview.5) · [Illustrated guide (Chinese)](docs/USAGE.md) · [Installation](docs/INSTALL.md) · [Licensing](LICENSES.md)

**Bring DSH and multiple locally running Agents into one group, then use Android to continue conversations, assign tasks, transfer attachments and answer approvals.** The computer runs the Agents and stores group data; the phone is a remote interface.

This community derivative is maintained by Seren-715, based on [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) and [DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot). It is not an official release of those projects, DeepSeek, OpenAI or Anthropic.

## Interface preview

These are **browser-rendered demonstrations using the current Android components and invented members, messages and tasks**. They do not show live Agent execution or a physical phone. Fonts, keyboard and system file pickers can differ on Android. [Screenshot provenance](docs/images/README.md).

<table>
<tr><th>Shared group conversation</th><th>Mention candidates above input</th><th>Approvals below the group title</th></tr>
<tr>
<td><img src="docs/images/chat-light.png" width="250" alt="Example conversation with Chief, Codex and Claude"></td>
<td><img src="docs/images/mentions.png" width="250" alt="Typing @ shows group-member candidates directly above the composer"></td>
<td><img src="docs/images/approvals.png" width="250" alt="Fixed approval panel, active member status and stop control"></td>
</tr>
</table>

## Features and controls

| Feature | Where and how |
| --- | --- |
| Shared rooms | Connect to and trust the computer, then open Groups to use existing rooms or create a room from desktop-configured members. |
| Multiple runtimes | Add DSH, Codex CLI, Claude Code, OpenCode and Hermes members configured on the computer. CLI members use dedicated group sessions. |
| Direct mentions | Type `@` for candidates above the composer, long-press a member avatar, or select a member from the `+` menu. `@all` invites everyone. |
| Moderated discussion | Open group information to choose moderator-first delegation or sequential replies and set the cumulative reply budget. This is not parallel execution. |
| Images and files | Use `+` to select attachments, remove them before sending, monitor/cancel uploads and tap historical cards to fetch attachments from the computer. |
| Approvals and stopping work | Approvals stay below the group title, with details, allow-once and deny actions. Use the stop button on an active member card to stop that member's work in this group. |
| Reading and drafts | New messages/approvals preserve the reading position. Jump to latest explicitly; text drafts are stored separately per server/account/computer/group. |
| Group settings and themes | Manage members, notice, working directory and DSH permissions; the interface follows light/dark themes. |

The [illustrated guide](docs/USAGE.md) places screenshots next to the corresponding operation, including attachments, group settings and dark mode.

## Download: choose one computer package

Install DSH first. **Do not enable the full and companion distributions together.**

The full distribution is now [published on npm](https://www.npmjs.com/package/dsh-remote-groups). Enter `dsh-remote-groups` directly in DSH’s Add plugin dialog. The default version is `0.1.0-preview.5`, still a preview. The companion remains a separate `.tgz` download.

| Existing installation | Download | Result |
| --- | --- | --- |
| Neither upstream plugin installed | [Full plugin archive](https://github.com/Seren-715/dsh-remote-groups/releases/download/v0.1.0-preview.5/dsh-remote-groups-0.1.0-preview.5.tgz) | Includes enhanced Remote and Bot; no separate upstream installation needed. |
| Remote, Bot or both already installed | [Companion archive](https://github.com/Seren-715/dsh-remote-groups/releases/download/v0.1.0-preview.5/dsh-remote-groups-companion-0.1.0-preview.5.tgz) | Keeps installed upstream packages, suspends standard old entries, and supplies enhanced/missing components internally. |
| Android, for either computer package | [Build61 APK](https://github.com/Seren-715/dsh-remote-groups/releases/download/v0.1.0-preview.4/dsh-remote-groups-build61.apk) | Android 8.0+ / ARM64. Existing build61 installations need no update. |

The companion also contains enhanced runtime code and is approximately the same size as the full package; it is not a thin bridge to arbitrary unmodified upstream versions. Existing full-package users can simply update the full package.

1. Install and enable the chosen archive in DSH, then restart normally. Install/enable the companion after upstream bundles.
2. Complete connection-service login and Host authorization in the plugin's Remote settings.
3. Configure model/CLI accounts, working directories and members on the computer.
4. On Android, sign into the same connection service, trust/connect to the computer, and open Groups.

Default Bot and Remote identity directories are reused. Custom `home`, service address and CLI settings must be reapplied to the new entries. Installation needs network access for ordinary dependencies. Keep the computer and Host running. See [installation/migration](docs/INSTALL.md) for ordering, upgrade and rollback boundaries.

Android build61 mirrors: [Baidu Netdisk (code 0715)](https://pan.baidu.com/s/10SJoD5KiJfmoEqfi-LQm-Q?pwd=0715) and [Quark Drive (code V5NZ)](https://pan.quark.cn/s/ae9efa7ba473?pwd=V5NZ). Computer plugin preview.5 adds download buttons and locally generated QR codes to its settings, available before signing in. These are download codes, not Host authorization codes. [Download instructions](docs/INSTALL.md#手机端下载入口).

## Current limits

- The plugin includes no model allowance and does not install/log into Agent CLIs. Usage belongs to each member's configured provider/account; image understanding depends on its model and configuration.
- Existing desktop application windows and prior sessions are not attached. CLI members use group-specific sessions.
- Mobile history currently contains the most recent **60 group messages**, with long-message expansion but no pagination to older messages.
- Foreground state/messages refresh approximately every **3 seconds**. The fixed approval panel is not an OS background push notification.
- The UI's reply-limit setting is a **cumulative member reply budget**, including mention hand-offs, not N full rounds or N replies per member. The configurable range is 1–40; blank uses the default budget.
- Attachment limits: 8 per message, at most 4 images; 20 MiB per item, 30 MiB total image bytes. Historical cards fetch data on demand. The chat displays user text and images while retaining model-reading context separately.
- Text drafts persist in private app storage; attachment drafts belong to the current screen lifecycle.
- This is a preview. Installation and native-emulator checks do not establish physical-phone networking, system picker behavior or live Agent success. Previous broad Remote-suite failures remain documented in [verification](docs/VERIFICATION.md).

## Source and licensing

| Directory | Contents | License |
| --- | --- | --- |
| `remote/` | Remote plugin, Android client, shared protocol | MIT, except Apache-2.0 DS Bot-derived modules |
| `host/` | Bot Host, client and upstream desktop source | Apache-2.0 with original third-party notices |
| `docs/` | Installation, illustrated guide and verification | Apache-2.0; screenshots retain component provenance |

See [build instructions](docs/BUILD.md), [upstream provenance](docs/UPSTREAM.md) and [license scope](LICENSES.md). Retain bundled licenses/notices on redistribution. No personal chats, credentials, model keys or APK signing private keys are included.
