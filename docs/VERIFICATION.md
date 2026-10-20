# Preview verification

## Full and companion distributions preview.4

- Both archives contain the same enhanced Remote/Bot runtimes. The companion retains installed upstream dependencies and uses official bundle patches with id/name assertions to suspend standard upstream entries, then inserts distinct enhanced entry IDs. It supplies missing components internally, without a separate upstream install or install-time script.
- Official DSH patch-composition checks passed for no upstream, Remote only, Bot only and both; assertion checks preserve unrelated plugins, and removing the companion patch restores upstream entries. A deliberate final user `disabled:false` override demonstrates the documented compatibility boundary rather than an automatic conflict detector.
- An isolated official DSH CLI profile first installed both upstream component archives, then installed the companion. Real Web boots subsequently covered both, Bot only, Remote only and neither upstream installed. All four returned Bot state and one instance each of the Bot/Remote browser modules; the invented Bot marker survived component removal/restart. For the Remote-only transition, the isolated bundle order was explicitly restored after re-adding Remote; the companion must follow upstream bundles. These checks cover default data directories and standard entry IDs, not automatic custom configuration migration.
- The companion was then removed through the official CLI and the two retained/reinstalled upstream components booted successfully, each client loaded once and the default-directory Bot marker remained. This verifies runtime restoration with the tested component archives, not backward compatibility of every enhanced data field.
- Playwright opened the actual companion details and rendered the Remote settings/authorization UI. The distribution reports four contained components, with the ordinary Remote/Bot/search entries active and the TUI alternative inactive. Remote TypeScript checking passed after rebuilding client configuration aliases.
- APK and Host business logic are unchanged from preview.3. No paid model prompts or personal DSH data were used. Previous Remote broad-suite failures and physical-phone/live-Agent limitations below still apply; this packaging check does not claim they were resolved.

## Unified computer plugin preview.3

- One root package `dsh-remote-groups` contains both prebuilt component runtimes, separate browser manifests/bundles and their licenses. Official DSH relative bundle paths load the two package roots; neither upstream plugin is an npm dependency or a separate user download. Installation uses `--ignore-scripts`.
- Official DSH Desktop CLI 0.2.1-rc.2 installed the final archive into an empty isolated Web profile. Its only third-party profile dependency was `dsh-remote-groups`; both `ds-bot` and `ds-harness-remote` appeared exactly once in the browser boot graph, `/api/bot` state succeeded, and no entry activation errors were reported.
- A separate migration test installed the two earlier component archives, retained an invented Bot marker, removed both old packages through the official CLI and installed the combined archive. The marker and Remote identity remained unchanged, only the combined dependency remained, and both clients loaded once without activation errors. This verifies default data locations; manually asserted old package names/custom home overrides require reapplying settings as described in INSTALL.
- Playwright used the actual isolated DSH page to open the combined plugin details, render Remote login/settings, toggle/save the remote-terminal setting, and open the Bot interface with the preserved test member. No real model Prompt was sent. Test servers/browser were stopped.
- Remote TypeScript check passed. A broad unchanged-runtime suite completed with 377 passing and 11 failing tests (388 total): failures included Windows symlink/rename privileges, a non-existent cwd assumption, a timeout, stream-state expectation and RTC `p2p` versus `lan` expectations. This suite is not claimed fully passing, and these remaining failures are not fixed by installation packaging. The isolated installation and actual browser checks above passed.
- Android remains the previously tested build61 APK; no phone code changed for the combined desktop installation. Physical-phone network and live-Agent E2E acceptance remains separate.

## Android build 61 and Host .20261020.2

Public APK: `dsh-remote-groups-build61.apk`, 53,732,565 bytes, SHA256 `84e4459574ce1d82fe976587bcd812d5de8663140a2ebff7846976eef72836c7`. VersionCode61 / ARM64 / API26+. Release completed in 7m38s. APK v2/v3 signatures match the existing Groups certificate, 16KiB alignment passed, and the packaged JS equals the generated final bundle. All 1,075 non-signature runtime entries remain byte-for-byte unchanged after adding embedded notices; draft code is present and isolated fixture markers are absent.

- 33 Android test files / 168 tests and TypeScript passed; targeted mention/draft/display tests passed again after the final cursor changes.
- Native Android API35/Hermes at 360×800 dp verified the fixed approval panel and details/allow action, cursor-local @ candidates, completion without caret lock, avatar long press, private-file draft recovery after screen and process restart, and OCR-free display text. Dark/light rendering and font scale 1.3 were checked.
- First room entry locates the latest history. Later new messages preserve the exact bounds of historical rows; new approvals preserve history position while their fixed panel takes space below the title. Only the explicit latest-message button performs a later jump.
- Host: 807 tests, 806 passed / 1 Windows symlink privilege skip, zero failures. Final display-field additions passed 58 targeted tests; client consistency and lint passed. Isolated official DSH Host smoke with a loopback model mock verified original image bytes, clean history/full text, trusted display fields and retained model-reading logs.
- The matching Host package was installed into the local Desktop profile through the official CLI and the installed source hashes matched. The running personal DSH process was not terminated; a normal restart is required to load it.
- Text drafts are durable; attachment drafts still belong to the current screen lifecycle. These checks do not establish physical-phone networking, vendor-specific behavior or live Agent response success.

## Android build 60

- 31 test files / 162 tests and TypeScript passed in the development checkout.
- React Native's AbortController implementation was used in cancellation tests; direct unsupported `throwIfAborted()` calls were removed.
- Android 15/API35 x86_64 emulator, 360×800 dp, RN0.86.2/Hermes/native SVG: actual group screen sent `111`, cleared the draft and displayed the message. The test store/transport was isolated and did not connect to real groups.
- Light/dark member selection, colored avatars, horizontal work cards, approval paths/buttons and font scale 1.3 were inspected in native screenshots.
- ARM64 Release built successfully. Application ID `io.github.liguobao.dshremote.groups`, versionName `0.5.13`, versionCode `60`, min API26/target36. Signing matches earlier Groups previews; no private key is published.
- Packaged JS exactly matched the final generated bundle and contained no isolated test-entry markers.
- The public APK adds embedded project notices and a dependency-license archive to the tested build60 APK, then aligns and signs it with the same certificate. All 1,075 original non-signature entries remain byte-for-byte unchanged. Public APK SHA256: `1489b41c7245aae5215f8b2c7c91c953bef5a6cd0e790c13ffa4171a3385f0e7`; APK signature verification and 16 KiB native-page alignment checks passed.

## Host and attachments

The prior development checkout passed 800 Host tests with one Windows symlink privilege skip. An isolated DSH smoke, using a loopback model mock, verified official image admission, staged file receipts, persisted group attachment references, exact binary-range download and foreign-message/path refusal. No paid models or personal group data were used.

Publication adds license notices, package metadata, reproducible notice generation and the Host release-declaration path derived from `repository.directory` for this monorepo. The publication snapshot passed 801 Host tests: 800 passed, one Windows symlink privilege skip, zero failures. Client generation consistency and lint passed; existing lint warnings remain. The packaged Host archive was inspected to contain LICENSE and NOTICE. A scan of the 991 initial staged source files found no private-key/token patterns; eight assignment-pattern hits were fixed synthetic credentials in existing test modules. Generated native folders, runtime profiles, logs, screenshots of real chats and signing keys are excluded.

## Limits

These are engineering checks, not a claim of complete phone-to-computer E2E coverage. Physical Android networking, vendor fonts/IME, picker/file-handler behavior and live model responses need validation in the target environment. Claude's earlier local check was blocked by provider HTTP403; CLI login does not prove requests will succeed. Existing desktop-window/history reuse and older-room-history paging are not implemented.
