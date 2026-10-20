// Updates of the installed app on Windows. electron-updater reads latest.yml of the newest
// GitHub release, downloads the installer in the background and checks its sha512. When the
// download is done, the window asks whether to restart now; otherwise the installer runs at
// the next quit.

export const UPDATE_TEXT = {
  en: {
    ready: version => `DeepSeek Bot ${version} is ready to install.`,
    readyDetail: 'Restart now to update, or it is installed the next time you quit.',
    restart: 'Restart now', later: 'Later',
    onFailure: version => `DeepSeek Bot ${version} is installed when its download is done, and then DeepSeek Bot opens again.`,
  },
  zh: {
    ready: version => `DeepSeek Bot ${version} 已经下载好。`,
    readyDetail: '现在重启就能更新；不重启的话，下次退出时安装。',
    restart: '立即重启', later: '稍后',
    onFailure: version => `DeepSeek Bot ${version} 下载完会自动安装，然后重新打开。`,
  },
}

const CHECK_EVERY_MS = 4 * 60 * 60_000

/**
 * @param {{
 *   updater: import('electron-updater').AppUpdater,
 *   beforeInstall: () => Promise<void>,
 *   ask?: (version: string) => Promise<boolean>,
 *   feed?: string,
 *   log?: Pick<Console, 'info' | 'error'>,
 * }} options `ask` answers whether to restart now; without it the update waits for the next
 *   quit. `beforeInstall` stops the Host, which runs from the files the installer replaces.
 *   `feed` is a folder URL with a latest.yml, in place of the GitHub releases.
 * @returns {{
 *   stop: () => void,
 *   latest: () => Promise<{ version: string, downloaded: Promise<boolean> } | null>,
 *   install: () => Promise<void>,
 * }} `latest` is what the newest check found: the version and whether its download finished.
 *   `install` stops the Host and runs the installer, which opens the app again.
 */
export function watchUpdates({ updater, beforeInstall, ask, feed, log = console }) {
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  if (feed) updater.setFeedURL({ provider: 'generic', url: feed })
  const install = async () => {
    await beforeInstall()
    updater.quitAndInstall(true, true)
  }
  let asked
  updater.on('update-downloaded', ({ version }) => {
    log.info(`DeepSeek Bot: update ${version} downloaded`)
    if (ask === undefined || asked === version) return
    asked = version
    void ask(version).then(now => (now ? install() : undefined))
      .catch((error) => { log.error(`DeepSeek Bot: update ${version} not installed: ${error instanceof Error ? error.message : String(error)}`) })
  })
  updater.on('error', (error) => { log.error(`DeepSeek Bot: update failed: ${error instanceof Error ? error.message : String(error)}`) })
  let latest = Promise.resolve(null)
  // A failed check or download also comes as an 'error' event.
  const check = () => {
    latest = updater.checkForUpdates().then(result => (result?.isUpdateAvailable && result.downloadPromise
      ? { version: result.updateInfo.version, downloaded: result.downloadPromise.then(() => true, () => false) }
      : null), () => null)
  }
  check()
  const timer = setInterval(check, CHECK_EVERY_MS)
  return { stop: () => { clearInterval(timer) }, latest: () => latest, install }
}
