# Preview verification

## Android build 61 and Host .20261020.2

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
