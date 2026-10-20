# Android group chat integration

This local fork adds a separate **Group chats** entry to the Android workspace screen. Ordinary Harness and CodeX workspaces keep their existing navigation. Rooms and Bot identities belong to the computer's DS Bot plugin; the phone is a remote controller, not another model runner.

## Data path

Android calls `plugin.route.call` over the existing trusted, authenticated Noise connection. The existing Host allowlist dispatches only `api/bot` operations. No additional relay service, model credentials, general command RPC, or Host allowlist changes are needed.

The mobile adapter supports `state`, `earlier`, `create-room`, `update-room`, `set-flags`, `delete-room`, `send`, `room-progress`, `approval-answer` and `stop-member-work`. Mobile approvals permit only one-time allow or reject. The DS Bot fork extends `earlier` with `{roomId}` and returns at most the latest 60 public room entries. Each entry includes its original length and any recorded time. `earlier {roomId,seq,offset}` reads one message in bounded 12,000 UTF-16 character chunks, independently of the model's context limit. An unmodified DS Bot cannot supply these room-history responses; install the matching computer plugin.

The screen polls state and selected-room history every three seconds after the previous request completes. Backgrounding, leaving the screen, disconnecting or changing room cancels pending view requests. Connection replacement rejects old replies; changing the connection clears room data and drafts. Failed sends retain the draft and are not retried automatically.

## Supported workflow

1. On the computer, enable Remote Host and the matching DS Bot fork. Create/configure any CLI members there first.
2. Install the locally built **DSH Remote Groups** APK. Its package `io.github.liguobao.dshremote.groups` is distinct from the upstream app, so both can coexist. Sign in and trust the computer in this separate installation. The existing `dshremote` URL scheme stays registered for OAuth/pairing compatibility; if Android offers an app chooser, select **DSH Remote Groups** for this installation.
3. Connect to the computer, open **Group chats**, select an existing room or create one from existing Bots.
4. Send plain messages, or open the input-left **+** menu for `@all` and individual members with their desktop avatars and roles. The chat header no longer contains mention chips.
5. Open the upper-right **…** to inspect group information and edit its name, notice, members, moderator, reply mode/limit, working folder and DSH permission preset. Pin/hide/delete follow the desktop semantics; hidden rooms remain discoverable through group search.

Messages reuse the desktop character paths and color selection, display names/roles/runtime icons and recorded timestamps, and reserve opposite-side space with bubbles at most 80% of the message row. Long messages use the desktop threshold (over 1,500 characters or 25 lines) and preview (10 lines / 600 characters), rendered through the existing native Markdown component. Expansion loads the full saved message on demand and preserves reading position. Incomplete old records are labeled rather than presented as complete; missing old timestamps are not fabricated. New Host group log entries persist their actual append time. Failure events from the existing room-progress operation are shown alongside persisted events.

The ported DS Bot sources and license notices live in `apps/android/src/vendor/ds-bot/`. The details screen adapts the existing desktop group settings to native controls; no new group-management Host endpoints or model providers were introduced.

The computer runs the selected runtime and pays its existing provider/account usage. This integration does not provide new model quota. Keep the computer and Remote Host running.

## Limits and verification

The initial mobile page does not create CLI Bots or attach arbitrary existing desktop application windows. It displays the latest 60 persisted room messages plus current work/approval state. It does not provide paging of older room history or native push notifications.

## Image and file uploads (build 59)

The composer supports gallery images and the Android document picker through the existing plus menu. Drafts display thumbnails/file cards, sizes and removal controls. Up to eight attachments, including four images, are staged per message; each attachment is at most 20 MiB and images total at most 30 MiB.

Uploads reuse the Host's existing `workspace.upload.v1` open/chunk/commit/abort operations over the authenticated carrier. Chunks are at most 64 KiB, with acknowledged-byte progress and cancellation. Unique temporary leaf names prevent overwriting workspace files; the original name remains the attachment display name. Successful receipts are retained in drafts until the group send succeeds. Cancellation during commit waits for the bounded receipt and prevents the subsequent group send. A lost send response is not retried automatically.

`send.uploadedFiles` contains only upload receipts `{name,path,bytes,originalName?,kind,mediaType?}`. The DS Bot Host validates the actual Session workspace, leaf path, size and file identity. Images enter the official encoded prompt admission; files use official `fileUploads.uploadStream` to obtain Session-scoped receipt IDs. Directly supplying durable file refs to `sessionController.prompt` is invalid and was caught by the real isolated Host smoke.

History exposes bounded image/file metadata. `earlier {roomId,seq,attachmentId,offset,limit}` reads at most 64 KiB of an attachment belonging to that exact message. The phone loads image previews on tap and opens downloaded documents through Android's existing file handlers. Missing handlers produce a visible error. All reads remain on the existing encrypted plugin route. Local CLI members receive official attachment file paths for their own file tools; image understanding still depends on the existing Host vision path and configured model capabilities.

Build 59 passed 158 Android tests, TypeScript checks and the native release build. Actual page code in an isolated RN-web fixture demonstrated file selection, draft display, upload-before-send payloads, attachment history and image opening; picker/filesystem/native open edges were mocked. A real isolated DSH instance, with only a loopback model mock, verified image/file admission, group log persistence, exact binary range download and foreign-message/path refusal. Physical Android picker, external document handlers and phone-to-Host networking remain device acceptance items.

Contract tests exercise the Android adapter through the actual allowlisted `PluginRouteBridge`, including blocked operations, malformed responses and cancellation. Connection tests reject stale replies after Host replacement. Android native installation, keyboard/layout and real phone-to-computer networking require device acceptance; Node tests and an APK build alone do not establish those results.

The UI revision (Android versionCode 58) passed 149 Android tests, TypeScript checks and the release build. Actual React Native page code was rendered through an isolated RN-web fixture at 400×850 and 360×740 in light/dark modes; mention insertion, notice/member updates, approval/stop and a 35,330-character chunked expansion were exercised. The APK signature matches the previous Groups preview, so it can update that package. Detailed screenshot/build evidence is stored locally in `artifacts/android/UI-ACCEPTANCE.md`. This is browser-based rendering of the real page source, not Android device acceptance.

Build 60 corrects native failures reported on build 59. React Native's installed AbortController lacks `throwIfAborted`; the group send and attachment services now use an `aborted`-based helper, tested with that exact implementation. Avatar SVGs resolve desktop CSS colors to native theme values. Member selection uses bounded checkbox rows, and work cards have explicit responsive widths and horizontal controls. Android API35/Hermes emulator checks passed for sending `111`, light/dark avatars and layouts, and font scale 1.3. The isolated fixture replaced only connection/store behavior; physical-phone encrypted networking and live-agent replies remain separate acceptance items. Evidence: `artifacts/android/NATIVE-FIX-60.md`.

Build with the repository's pinned pnpm and Expo workspace preparation, then Expo prebuild and Gradle assembleRelease. Use a full JDK 17 including `jlink`; a cropped IDE JBR may fail Android's JDK image transform. The foreground-service config plugin generates Kotlin sources in `android.package`, so its package matches the preview's application namespace. The preview build keeps a distinct Android package; do not replace the upstream package without a deliberate signing and data-migration plan.
