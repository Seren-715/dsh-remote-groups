import QRCode from 'qrcode'
import type { Translate } from '../client-locale.js'
import type { ClientReact } from './types.js'

export const mobileDownloads = [
  { id: 'baidu', title: 'mobileDownloadBaidu', url: 'https://pan.baidu.com/s/10SJoD5KiJfmoEqfi-LQm-Q?pwd=0715', code: '0715' },
  { id: 'quark', title: 'mobileDownloadQuark', url: 'https://pan.quark.cn/s/ae9efa7ba473?pwd=V5NZ', code: 'V5NZ' },
] as const
export const mobileApkUrl = 'https://github.com/Seren-715/dsh-remote-groups/releases/download/v0.1.0-preview.4/dsh-remote-groups-build61.apk'
export const mobileGuideUrl = 'https://github.com/Seren-715/dsh-remote-groups/blob/main/docs/INSTALL.md'

export function createMobileDownloads(React: ClientReact) {
  return function MobileDownloads({ t }: { t: Translate }): unknown {
    const [images, setImages] = React.useState<Record<string, string>>({})
    const [failed, setFailed] = React.useState(false)
    React.useEffect(() => {
      let disposed = false
      void Promise.all(mobileDownloads.map(async source => [source.id, await QRCode.toDataURL(source.url, {
        width: 184, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: '#ffffffff' },
      })] as const)).then(values => {
        if (!disposed) setImages(Object.fromEntries(values))
      }).catch(() => { if (!disposed) setFailed(true) })
      return () => { disposed = true }
    }, [])

    return React.createElement('section', { className: 'dshRemoteMobileDownload', 'aria-label': t('mobileDownloadTitle') },
      React.createElement('h3', null, t('mobileDownloadTitle')),
      React.createElement('p', null, t('mobileDownloadHint')),
      React.createElement('div', { className: 'dshRemoteMobileSources' }, mobileDownloads.map(source =>
        React.createElement('div', { key: source.id, className: 'dshRemoteMobileSource' },
          React.createElement('strong', null, t(source.title)),
          React.createElement('div', { className: 'dshRemoteMobileQr' }, images[source.id]
            ? React.createElement('img', { src: images[source.id], width: 184, height: 184, alt: t('mobileDownloadQrAlt', { source: t(source.title) }) })
            : React.createElement('span', { role: 'status' }, t(failed ? 'mobileDownloadQrFailed' : 'mobileDownloadQrLoading'))),
          React.createElement('span', null, t('mobileDownloadCode'), ' ', React.createElement('code', null, source.code)),
          React.createElement('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', className: 'dshRemoteMobileOpen' }, t('mobileDownloadOpen', { source: t(source.title) }))))),
      React.createElement('p', { className: 'dshRemoteMobileFooter' },
        React.createElement('span', null, t('mobileDownloadVersion')),
        React.createElement('a', { href: mobileApkUrl, target: '_blank', rel: 'noopener noreferrer' }, t('mobileDownloadGithub')),
        React.createElement('a', { href: mobileGuideUrl, target: '_blank', rel: 'noopener noreferrer' }, t('mobileDownloadGuide'))))
  }
}
