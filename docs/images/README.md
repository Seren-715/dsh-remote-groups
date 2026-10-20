# Documentation screenshots

Captured on 2026-10-20 for preview.4 / Android build61 documentation. The six interface PNGs were captured with Playwright at a 400 × 850 CSS-pixel viewport, using the current repository's `remote/apps/android/src` GroupsScreen, GroupDetails, display/attachment/approval components and theme through React Native Web.

The connection/store, file persistence/pickers, clipboard, safe area and native rendering boundary are isolated fixtures. All member identities, messages, filenames and tasks shown are invented. No personal account/profile, real chat or model execution was used. These are browser-rendered demonstrations, not screenshots of a physical Android device or proof of live Agent success. No screenshot was AI-generated or composited. Web fonts, keyboard and native system pickers differ from Android.

| Image | Demonstrated state |
| --- | --- |
| chat-light.png | Three-member discussion in light mode |
| chat-dark.png | Same example in dark mode |
| mentions.png | Typed @ and candidates immediately above the composer |
| group-settings.png | Member administration, notice and discussion modes |
| attachments.png | Selected, unsent file attachment card |
| approvals.png | Fixed approval panel and active-member stop control |

The interface reuses this project's existing components and character assets. Keep the MIT/Apache-2.0 source attribution and original Host NOTICE as described in the repository's LICENSES.md. The mock React Native Web SVG adapter emits a development-only maskType DOM-prop warning; these images do not establish native rendering behavior. Native validation is documented separately in ../VERIFICATION.md.

`mobile-baidu.png` and `mobile-quark.png` are locally generated download QR codes, not UI screenshots. They encode the maintainer-provided build61 share URLs (including access codes) and were independently decoded to verify their payloads. The cloud-hosted APK bytes have not been independently downloaded/hashed in this check.

`mobile-download-settings-light.png` and `mobile-download-settings-dark.png` show the actual official DSH Web plugin details region, installed from the preview.5 archive into an isolated test profile, before Remote account login. They contain only the public download section, not personal account/profile data. Two QR codes were decoded from the rendered image elements and matched to the share URLs. The narrow-window check used 480 CSS pixels.
