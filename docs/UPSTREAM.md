# Upstream provenance

License verification date: 2026-10-20.

| Component | Upstream | Baseline reference | Local development HEAD |
| --- | --- | --- | --- |
| Remote | https://github.com/liguobao/ds-harness-remote | `9c483fb8936730c726b1ae4046fc545410382db7` (`origin/main` in the development checkout) | `ca228b3ae4440da21400c59630666bf7c3a44d1b` plus uncommitted build60 fixes |
| DS Bot | https://github.com/Fei2411/DeepSeek-Bot | `d6fc7cb42f3725f8bab0d7539c8490d4bf0a4028` (`origin/dev`, parent of the local group integration) | `0d31b4630e048708e5569ab0f27b498263653be0` |

This is a clean source snapshot, not a claim that all included upstream code was authored here. Original license/notice files and upstream contributor attribution are retained. Local Git history, runtime profiles, screenshots of real chats, dependency caches and signing private keys are excluded.

Publication preparation adds notices to modified Apache files, includes NOTICE in the Host archive, updates fork package metadata and documents the combined project. Both projects retain their separate workspaces and upstream package identities for compatibility.

Primary license sources:

- https://github.com/liguobao/ds-harness-remote/blob/main/packages/plugin/LICENSE
- https://github.com/Fei2411/DeepSeek-Bot/blob/main/LICENSE
- https://github.com/Fei2411/DeepSeek-Bot/blob/main/NOTICE

The Remote Android vendor code originates from `host/ds-bot/src/client/characters.js`, `inks.js` and the pure logic in `fold.js`; its own NOTICE identifies the adapted module. Native SVG rendering and the mobile group adapter are part of this integration.
