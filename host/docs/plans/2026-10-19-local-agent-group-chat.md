> Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.

# Local Agent group chats (local fork)

This fork adds real Codex, Claude Code, OpenCode and Hermes execution to DS Bot groups. It retains the upstream DSH room, ordered speaking, mentions, late replies and Remote `api/bot` transport. It does not change DeepSeek Harness or the installed Remote package.

## Contract

Each Bot has a `runtime`: `dsh` (default), `codex`, `claude`, `opencode` or `hermes`. DSH keeps the Bot identity and group UI. External group sessions live in `room.runtimeSessions`, separately from DSH session IDs. Each group/member pair has a dedicated external conversation. Its working directory is the group's folder, the member's folder, or the team folder. Changing the directory or runtime starts a fresh conversation.

Codex uses the installed CLI's App Server over stdio. The other agents use ACP. Commands and arguments are Host configuration, never mobile request parameters. Node entry points are launched without a shell; Electron hosts explicitly use Node mode. Windows cancellation terminates only the process tree created by this adapter.

The existing `@Name` relay remains the scheduling mechanism. Administrator-led and everyone-in-order modes are retained. `room.maxTurns` optionally bounds total member turns for each user-message round (1–40); `null` restores the upstream default bound. This is a reply limit, not a token budget or a limit on the tools inside one Agent turn. Existing limits on delayed replies remain in place.

External text/tool events feed the group's work status. Final responses join the shared group log and can mention the next member. Permission requests appear in existing group approval cards; only one-time allow/reject is offered. Member stop and group stop propagate to the external execution. Permission policies inside each installed Agent still apply; DSH permission presets apply to DSH members.

DSH remains responsible for Main Bots and its own management tools. External members can be group administrators and call peers with their final `@Name` text, but do not acquire DSH team, memory, browser or scheduling tools. Their direct-chat page explains the group-only boundary. Group file attachments reach external members as paths resolved by the official Host attachment capability; members read them with their own available file tools. Pictures retain the existing shared vision-to-text reading path; this does not establish native image input for a CLI.

## Dedicated sessions and desktop applications

The user confirmed that dedicated group sessions should ship first. Attaching existing desktop windows/chats is a later integration. CLI/App Server/ACP access does not establish that an existing desktop conversation can be controlled. This version neither scrapes desktop windows nor replays their histories.

## Validation

Use `npm run build`, `npm test`, `node scripts/build-client.mjs --check` and `npm run lint` in `ds-bot/`. Protocol tests use mock processes; room integration tests use isolated fake DSH contexts. `scripts/check-local-agents.mjs` is an explicit live check using installed Agent logins, a fixed short response, no requested tools, and rejected approval callbacks. It can incur model usage and is not part of `npm test`.

On this machine, the fixed-response live checks passed for Codex, OpenCode and Hermes. Hermes required its own project's pinned `agent-client-protocol==0.9.0` extra. Claude initialized and had local login state, but its request received HTTP 403; no model/auth configuration was changed to work around it.

A separately initialized DSH Web profile under `.dsh-test-ui` loaded the plugin. Its DSH model was a local mock. In its five-member group, a real Codex turn returned `GROUP-HOST-OK` into the actual DSH group UI. This establishes the local DSH-to-Codex path, separately from smartphone Remote transport validation.

In that same isolated Host, a real Codex file-writing turn requested command approval. The group displayed its approval card at a 393px viewport. After one-time allowance, the exact file content was verified and `GROUP-WORK-DONE` returned to the group with no remaining active work. The discussion-limit input persisted a changed value through `update-room`. Final automated suite: 781 passed, 0 failed; build consistency and lint passed (existing upstream warnings remain).

## Android Remote integration

The local `dsh-remote-group` fork adds a separate Android group-chat screen. It uses the existing trusted Remote Noise connection and `plugin.route.call` / `api/bot` allowlist. The Host's `earlier` operation now accepts `{roomId}` and returns at most 60 public room log entries. Internal working directories and runtime session metadata are not included in this history response. The previous DSH session/cursor history operation remains available.

The mobile page reuses computer Bot identities, group routing, approvals and execution. It supports group creation, mentions, reply limits, one-time approval/rejection and member stop. CLI configuration remains on the computer. The preview Android package installs separately from the upstream app and requires its own login/trust setup. A successful APK build and Node contract tests do not prove real phone networking or layout acceptance.

### Mobile attachments

The Remote workspace upload protocol transfers up to 20 MiB per file in chunks. `send.uploadedFiles` accepts its `{name,path,bytes}` receipt with a `kind` (`image` or `file`) and an image `mediaType`. The Host independently resolves the official Session working directory, accepts only `./leaf` references, rejects symbolic links and changed sizes, and imports bytes through the official attachment capability. Pictures use native image admission and files use verbatim streamed storage. Existing base64 `send.images` remains compatible.

Group history exposes only public image/file attachment metadata. `earlier({roomId,seq,attachmentId,offset?,limit?})` reads a reference belonging to that exact group message, with a maximum decoded chunk of 64 KiB and `nextOffset:null` at the end. It does not accept caller-supplied attachment references or Host paths. These chunks support image viewing and file downloads without overflowing the encrypted Remote message frame.

Latest Host automated suite after the mobile history extension: 786 tests passed; build consistency and lint passed. Real isolated Host smoke is tracked in the task log.

## Remaining checks

- Resolve the Claude service-side refusal without guessing its cause.
- Verify actual phone Remote UI loading and approval/stop flows on the user's connected device.
- Add desktop-existing-chat adapters if required in the next stage.
