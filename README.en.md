# DSH Remote Groups

[中文](README.md) · [Downloads](https://github.com/Seren-715/dsh-remote-groups/releases) · [Licensing](LICENSES.md)

A community integration of Android remote access and multi-agent group chats, maintained by Seren-715. Based on [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) and [DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot); this is an independent derivative, not an official release of those projects or their vendors.

The computer runs DSH and locally configured Codex CLI, Claude Code, OpenCode or Hermes members. Android shares rooms and messages, sends mentions, handles one-time approvals, stops work and transfers images/files. Discussion has a configurable utterance limit. Existing desktop windows/history are not attached; CLI members use dedicated group sessions. Usage is charged to the selected runtime's existing account/provider.

Approvals stay below the room title, mentions can be inserted by long-pressing an avatar or selecting a cursor-local `@` candidate above the composer, and text drafts survive reopening the screen/application. New messages and approvals preserve the history reading position; jumping to the latest message is explicit. Image-reading context is separated from visible user text.

Install the ARM64 Android 8+ APK and matching DS Bot package from [Releases](https://github.com/Seren-715/dsh-remote-groups/releases). Install the `.tgz` through DSH's plugin manager; it replaces the package named `ds-bot`. Keep a compatible Remote connection plugin enabled on the computer, configure CLI login/models and room working directories, connect the phone and open Group chats. The computer must remain running. Keep the accompanying license/notices when redistributing binaries.

- `remote/`: MIT Remote/Android project, except Apache-2.0 DS Bot-derived vendor files and image-display adapter.
- `host/`: Apache-2.0 DS Bot project with original notices and file-level modification notices.
- [Build](docs/BUILD.md), [provenance](docs/UPSTREAM.md), [verification and limits](docs/VERIFICATION.md).

This is a preview. Build 60 passed native Android emulator send/layout checks in light/dark themes and at 130% font scale. Physical-device networking, vendor fonts/pickers and live agents require environment-specific testing. No account data, credentials or signing private keys are included.
