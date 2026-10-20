// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import { createElement as h } from 'react'
import { t } from './i18n.js'

export const RUNTIMES = [
  ['dsh', 'DSH'], ['codex', 'Codex'], ['claude', 'Claude Code'],
  ['opencode', 'OpenCode'], ['hermes', 'Hermes'],
]

export function RuntimePicker({ value = 'dsh', onChange, disabled = false }) {
  return h('select', {
    className: 'bt-bs-input', value, disabled, 'aria-label': t('Agent runtime'),
    onChange: event => onChange(event.target.value),
  }, RUNTIMES.map(([id, label]) => h('option', { key: id, value: id }, label)))
}
