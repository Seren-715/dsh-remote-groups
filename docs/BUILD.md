# Build from source

Use Node.js 22.19+ and each project's existing lockfile. The two workspaces are intentionally independent.

## DS Bot plugin

```sh
cd host/ds-bot
npm ci
npm run build
node scripts/build-client.mjs --check
npm run harness
npm test
npm run lint
npm pack
```

Install the resulting `.tgz` through DSH's plugin manager. The package retains `ds-bot` for compatibility and replaces any currently installed package with that name. Do not run model smoke scripts against personal DSH data.

## Remote and Android

```sh
cd remote
npx pnpm@9.15.4 install --frozen-lockfile
npx pnpm@9.15.4 --filter './packages/**' -r build
npx pnpm@9.15.4 --dir apps/android run check
npx pnpm@9.15.4 --dir apps/android test
npx pnpm@9.15.4 --dir apps/android exec expo prebuild --platform android --no-install
```

For ARM64 on Windows, with a full JDK17 and Android SDK/NDK available:

```powershell
./apps/android/android/gradlew.bat -p apps/android/android :app:assembleRelease --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

See `remote/apps/android/README.md` for existing workspace/rendering prerequisites and `remote/docs/design/android-group-chat.md` for the integration protocol. The default generated signing configuration is for development. Use your own private signing key for your distribution; the key for the published preview APK is not in this repository. Your self-signed build cannot cover-install this preview unless the signing certificate matches. Keep generated native/build folders and keys out of Git.

Remote's GitHub-install entry remains in `remote/` with its built plugin distribution. Refer to its original installation docs for DSH compatibility. This repository does not publish to npm automatically.

## Unified computer plugin

After preparing both component builds, run `npm run pack:plugin` at the repository root. The root manifest ships the existing runtime/client files and license notices. No install-time build script is required. Use the resulting `dsh-remote-groups` archive instead of installing either component separately. See [INSTALL](INSTALL.md) for migration.

Run `npm run pack:companion` for the existing-upstream distribution. It stages the same allowlisted runtime files and notices, changes the distribution name, and uses `companion/cordis.patch.yml` to suspend standard upstream entries before mounting enhanced components under distinct IDs. It does not modify installed upstream files. Run `scripts/test-distributions.mjs` with `DSH_PACKAGING_HARNESS` pointing at a development installation containing official DSH dependencies to verify patch composition, removal and assertion boundaries. Both archives are mutually exclusive.
