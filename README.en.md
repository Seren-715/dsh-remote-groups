# DSH Remote Groups

[中文](README.md) · [Downloads](https://github.com/Seren-715/dsh-remote-groups/releases) · [Licensing](LICENSES.md)

A community integration of Android remote access and multi-agent group chats, maintained by Seren-715. Based on [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) and [DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot); this is an independent derivative, not an official release of those projects or their vendors.

The computer runs DSH and locally configured Codex CLI, Claude Code, OpenCode or Hermes members. Android shares rooms and messages, sends mentions, handles one-time approvals, stops work and transfers images/files. Discussion has a configurable utterance limit. Existing desktop windows/history are not attached; CLI members use dedicated group sessions. Usage is charged to the selected runtime's existing account/provider.

Approvals stay below the room title, mentions can be inserted by long-pressing an avatar or selecting a cursor-local `@` candidate above the composer, and text drafts survive reopening the screen/application. New messages and approvals preserve the history reading position; jumping to the latest message is explicit. Image-reading context is separated from visible user text.

After installing DSH, choose **one computer plugin** from [Releases](https://github.com/Seren-715/dsh-remote-groups/releases): new users use `dsh-remote-groups-0.1.0-preview.4.tgz`; users with Remote, Bot or both installed use `dsh-remote-groups-companion-0.1.0-preview.4.tgz`. Both use the same Android APK, `dsh-remote-groups-build61.apk`. Install/enable through DSH's plugin manager and restart normally. Ordinary runtime dependencies require network access during installation.

Configure Remote login/Host authorization, model/CLI accounts and rooms, then connect the phone. The companion keeps upstream packages installed, suspends their standard entries through the official bundle configuration, and runs the enhanced components included in the archive, supplying any missing component. It is not a thin bridge and has approximately the same size/functionality as the full distribution. Enable it after upstream bundles; never enable the full and companion distributions together. Default data paths are reused; custom directories/settings must be reapplied. See [installation and migration](docs/INSTALL.md).

- `remote/`: MIT Remote/Android project, except Apache-2.0 DS Bot-derived vendor files and image-display adapter.
- `host/`: Apache-2.0 DS Bot project with original notices and file-level modification notices.
- [Build](docs/BUILD.md), [provenance](docs/UPSTREAM.md), [verification and limits](docs/VERIFICATION.md).

This is a preview. Build 61 passed native Android emulator send/layout checks in light/dark themes and at 130% font scale. Physical-device networking, vendor fonts/pickers and live agents require environment-specific testing. No account data, credentials or signing private keys are included.
