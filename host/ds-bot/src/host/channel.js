// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
// Client channel: the team view the browser renders, and the POST /api/bot endpoints.
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { questionReply } from './parts.js'
import { COLORS, EXTRA_COLORS, ROUTE } from './constants.js'
import { importMobileFiles, readMobileAttachment } from './mobile-attachments.js'
import { groupDisplayText } from './group-display.js'

const LANGUAGES = { zh: 'Chinese (简体中文)', en: 'English' }
const RUN_STATS = ['sessionStats', 'tokenUsage', 'contextPressure']

const invalid = message => Object.assign(new Error(message), { code: 'bot/invalid' })
// Programming and file system errors are DS Bot's own faults, logged with their stack;
// any other error is a refusal whose message is meant for the user.
const isInternal = error => error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError
  || error instanceof SyntaxError || (typeof error?.code === 'string' && /^E[A-Z_]+$/.test(error.code))
export function errorCode(error) {
  if (typeof error?.code === 'string' && error.code.startsWith('bot/')) return error.code
  return isInternal(error) ? 'bot/internal' : 'bot/refused'
}

export function install(rt) {
  const { ctx, state } = rt

  // The DSH interface language of the last browser that asked for the team.
  let uiLocale
  rt.uiLanguage = () => (uiLocale === undefined ? undefined : LANGUAGES[uiLocale.split('-')[0].toLowerCase()] ?? uiLocale)

  const ok = value => ({ ok: true, value })
  const fail = (message, code = 'bot/error') => ({ ok: false, error: { code, message, details: {} } })
  // Models come from DSH, not state.json, so a provider added in Harness settings
  // changes the view without a new revision.
  const modelsKey = () => `${rt.cachedCatalog().map(entry => `${entry.ref}${entry.needsKey ? '!' : ''}${entry.reasoning ? `:${JSON.stringify(entry.reasoning)}` : ''}`).join(',')}|${rt.cachedDefault() ?? ''}`
  const view = () => ({
    revision: state.revision,
    workspaceId: state.workspaceId ?? null,
    // `mainBotId` is the first Main Bot, which the sidebar shows as its tile.
    mainBotId: state.mainBotIds[0] ?? null,
    mainBotIds: state.mainBotIds,
    // `sessionId` is the Bot's current own-chat part; `parts` its earlier ones.
    // `waiting`: the Bot holds its greeting until the user picks its model.
    bots: Object.values(state.bots).map(({ segments, kickoff, ...bot }) => ({
      ...bot, sessionId: rt.chatOf(bot.id), parts: (segments ?? []).map(segment => segment.sessionId), ...(kickoff ? { waiting: true } : {}),
    })),
    // `parts`: the members' hidden group Sessions and their earlier segments, for usage.
    rooms: Object.values(state.rooms).map(({ log, seen, lateRounds, sessions, segments, ...room }) => {
      const parts = [...Object.values(sessions ?? {}), ...Object.values(segments ?? {}).flat().map(segment => segment.sessionId)]
      const last = (log ?? []).filter(line => line.kind === undefined).at(-1)
      const preview = last && groupDisplayText(last)
      return { ...room, parts, ...(last ? { preview: last.who === 'User' ? preview : `${last.who}：${preview}` } : {}) }
    }),
    exchangeTurns: state.exchangeTurns,
    questions: state.questions,
    // The team's DSH Agent (at most one): plain dsh Sessions, not Bots.
    agents: Object.values(state.agents),
    // Key names and who may use them; values never leave the host.
    secrets: rt.secretsView(),
    capabilities: rt.capabilityLibraryView(),
    secretRequests: state.secretRequests ?? {},
    colors: [...COLORS, ...EXTRA_COLORS],
    models: rt.cachedCatalog(),
    defaultModel: rt.cachedDefault() ?? null,
    permissions: rt.permissionCatalog?.() ?? null,
    modelsKey: modelsKey(),
    prefs: state.prefs,
    // Whether a Desktop window should serve Bot browser reads (see browser.js).
    browser: rt.browserEnabled,
    // False when config.memory turns memory off: no Memory row or panel.
    memory: rt.memoryEnabled !== false,
    // Set while another dsh host holds the team (store.js): why this one cannot change it.
    readOnly: rt.readOnly() ?? null,
  })
  // What changes without a new revision, sent with every state answer. `memoryNews`:
  // per Bot, its latest memory change; `memoryReviews`: memory reviews waiting or
  // running; `work`: per Bot, the turn it runs and its tool; per group, the members whose
  // turn there runs; the approvals waiting; per Bot, who it waits for to hand back work;
  // and per Session, when its running turn began.
  const live = () => ({
    activity: rt.activityView(),
    work: { bots: rt.workView(), rooms: rt.roomWorkView(), approvals: rt.approvalsView(), waiting: rt.waitingView?.() ?? {}, turns: rt.turnsView?.() ?? {} },
    memoryNews: rt.memoryNews(),
    memoryReviews: rt.memoryReviews(),
    connectors: rt.connectorsView(),
    capabilityStatuses: rt.capabilityStatusesView(),
  })
  // What a host that only reads the team may still answer.
  // Updates change the dsh profile, not the team, so a reading host may run them too.
  const READS = new Set(['state', 'models', 'efforts', 'providers', 'provider-models', 'earlier', 'chat', 'run-stats', 'room-progress', 'exchange', 'exchange-text', 'file-text', 'usage', 'schedules', 'memory-view', 'browser-wait', 'browser-result', 'diagnostics', 'diagnostics-log', 'diagnostics-clear', 'update-check', 'update-install', 'dsh-update-install', 'repo-stars', 'approval-answer'])

  function setPrefs(body) {
    if (body.theme !== undefined) {
      if (typeof body.theme !== 'string' || !/^[a-z][\w-]{0,31}$/.test(body.theme)) throw invalid('Unknown theme')
      state.prefs.theme = body.theme
    }
    if (body.accent !== undefined) {
      if (body.accent === null || body.accent === '') delete state.prefs.accent
      else if (/^#[0-9a-f]{6}$/i.test(body.accent)) state.prefs.accent = body.accent
      else throw invalid('Accent must be a #rrggbb color')
    }
    if (body.motion !== undefined) {
      if (body.motion === null || body.motion === 'normal') delete state.prefs.motion
      else if (body.motion === 'quiet' || body.motion === 'lively') state.prefs.motion = body.motion
      else throw invalid('Motion must be quiet, normal or lively')
    }
    return rt.save()
  }

  const handle = async (endpoint, payload, signal) => {
    try {
      const body = payload ?? {}
      await rt.refresh()
      const readOnly = rt.readOnly()
      if (readOnly !== undefined && !READS.has(endpoint)) return fail(readOnly, 'bot/read-only')
      switch (endpoint) {
        case 'state':
          if (typeof body.locale === 'string' && /^[a-z]{2,3}(-[\w-]+)?$/i.test(body.locale)) uiLocale = body.locale
          if (readOnly === undefined) await rt.bootstrap()
          await rt.catalog()
          await rt.loadSecrets()
          if (body.since === state.revision && (body.models === undefined || body.models === modelsKey())) return ok({ revision: state.revision, unchanged: true, ...live() })
          return ok({ ...view(), ...live() })
        case 'models':
          await rt.catalog({ fresh: true })
          return ok({ modelsKey: modelsKey() })
        case 'efforts':
          return ok(await rt.reasoningOf(String(body.ref ?? '')) ?? { efforts: [] })
        // Model providers and their keys, for a window without DSH's own Models page.
        case 'providers':
          return ok(await rt.providersView())
        case 'provider-key':
          if (body.value === null) await rt.clearProviderKey(String(body.provider ?? ''))
          else await rt.setProviderKey(String(body.provider ?? ''), body.value)
          return ok(await rt.providersView())
        case 'provider-add':
          return ok(await rt.addProvider(body))
        case 'provider-models':
          return ok(await rt.discoverModels(body))
        case 'provider-remove':
          return ok(await rt.removeProvider(String(body.provider ?? '')))
        case 'duplicate-bot':
          await rt.load()
          return ok(await rt.duplicateBot(body.id))
        case 'set-prefs':
          await rt.load()
          await setPrefs(body)
          return ok(state.prefs)
        case 'exchange': {
          await rt.load()
          const pair = new Set([body.a, body.b])
          return ok(state.exchanges.filter(entry => pair.has(entry.from) && pair.has(entry.to)))
        }
        case 'exchange-text': {
          await rt.load()
          const entry = state.exchanges.find(item => item.id === body.id)
          if (entry === undefined) return fail('This message is no longer kept', 'bot/stale')
          return ok(await rt.exchangeText(entry))
        }
        // A long Bot post's file (attachLong), for the group chat's "Show all".
        case 'file-text': {
          if (typeof body.file?.attachmentId !== 'string') return fail('No file named', 'bot/invalid')
          const read = await rt.fileText(body.file)
          return read === undefined ? fail('This file cannot be read here', 'bot/unavailable') : ok(read)
        }
        case 'earlier':
          await rt.load()
          // Remote already carries `earlier`; keep group reads on that authenticated route.
          if (typeof body.roomId === 'string' && body.roomId.length > 0) {
            const room = rt.roomOf(body.roomId)
            if (room === undefined) return fail('Unknown group', 'bot/not-found')
            if (body.attachmentId !== undefined) return ok(await readMobileAttachment(ctx, room, body, signal))
            if (body.seq !== undefined) return ok({ roomId: room.id, seq: body.seq, ...await rt.readGroupLine(room, body.seq, { offset: body.offset, limit: body.limit }) })
            const entries = await Promise.all((room.log ?? []).slice(-60).map(async line => {
              const { seq, who, botId, time, kind, images, files } = line
              const display = images?.length && rt.readGroupLine
                ? await rt.readGroupLine(room, seq, { limit: 2000 })
                : { text: typeof line.displayText === 'string' ? line.displayText : groupDisplayText(line), length: line.displayLength ?? line.length }
              const text = display.text
              return {
                seq, who, text, length: display.length ?? text.length,
                ...(images?.length ? { displayText: text, displayLength: display.length ?? text.length } : {}),
                ...(botId === undefined ? {} : { botId }),
                ...(time === undefined ? {} : { time }),
                ...(kind === undefined ? {} : { kind }),
                ...(images?.length ? { images: images.map(({ attachmentId, mediaType, name, bytes, width, height }) => ({ attachmentId, mediaType, ...(name === undefined ? {} : { name }), bytes, width, height })) } : {}),
                ...(files?.length ? { files: files.map(({ attachmentId, name, bytes }) => ({ attachmentId, name, bytes })) } : {}),
              }
            }))
            return ok({ roomId: room.id, entries, hasMore: false })
          }
          return ok(await rt.earlierPage(String(body.sessionId ?? ''), body.cursor ?? undefined))
        case 'chat':
          await rt.load()
          return ok(await rt.chatPage(String(body.botId ?? ''), body.cursor ?? undefined))
        // DSH's own whole-log figures for the current part of a Bot's chat, the ones its
        // status bar shows; a window without that bar shows them in the Bot's details.
        case 'run-stats': {
          await rt.load()
          const bot = rt.botOf(String(body.botId ?? ''))
          if (bot === undefined) return fail('Unknown Bot', 'bot/not-found')
          const projections = ctx.get?.('sessionProjections')
          if (projections === undefined) return ok(null)
          const agent = await rt.resolveAgent(rt.chatOf(bot.id))
          return ok(projections.snapshot(agent.session, RUN_STATS).values)
        }
        case 'usage':
          await rt.load()
          return ok(await rt.usageView({ timeZone: typeof body.timeZone === 'string' ? body.timeZone.slice(0, 64) : undefined }))
        case 'room-progress':
          return ok([...rt.roomProgress.entries()].filter(([, entry]) => entry.roomId === body.roomId).map(([callId, entry]) => ({ callId, replies: entry.replies, speaking: entry.speaking ?? null })))
        case 'create-bot': {
          await rt.bootstrap()
          const bot = await rt.createBot({ name: body.name, role: body.role, color: body.color, instructions: body.instructions, brief: body.brief, avatar: body.avatar, model: body.model, effort: body.effort, workDir: body.workDir, runtime: body.runtime })
          return ok(bot)
        }
        case 'update-bot':
          await rt.load()
          return ok(await rt.updateBot(body.id, body))
        case 'delete-bot':
          await rt.load()
          await rt.deleteBot(body.id)
          return ok(view())
        case 'set-main':
          await rt.load()
          await rt.setMain(body.id, body.main !== false, {
            primary: body.primary === true,
            replace: typeof body.replace === 'string' ? body.replace : undefined,
          })
          return ok(view())
        case 'create-room': {
          await rt.load()
          const room = await rt.createRoom({ members: Array.isArray(body.members) ? body.members : [], name: body.name, mode: body.mode, notice: body.notice, maxTurns: body.maxTurns, ...(typeof body.admin === 'string' ? { admin: body.admin } : {}) })
          if (body.greet === true) await rt.greetRoom(room.id).catch(error => rt.warn('ds-bot: greeting in %s failed: %s', room.name, error))
          return ok(room)
        }
        case 'update-room': {
          await rt.load()
          const { room, changes } = await rt.updateRoom(body.id, {
            name: body.name,
            notice: body.notice,
            mode: body.mode,
            maxTurns: body.maxTurns,
            admin: body.admin,
            members: Array.isArray(body.members) ? body.members : undefined,
            add: Array.isArray(body.add) ? body.add : undefined,
            remove: Array.isArray(body.remove) ? body.remove : undefined,
            workDir: body.workDir,
            permission: body.permission,
          })
          return ok({ room: view().rooms.find(entry => entry.id === room.id), changes })
        }
        case 'folders':
        case 'folder-pick':
        case 'folder-list':
          await rt.load()
          return ok(await rt.folderEndpoint(endpoint, body, signal))
        case 'add-agent':
          await rt.load()
          return ok(await rt.addAgent())
        case 'agent-session':
          await rt.load()
          return ok({ sessionId: await rt.createAgentSession(body.agentId, body.workspaceId) })
        case 'agent-adopt':
          await rt.load()
          return ok({ sessionId: await rt.adoptAgentSession(body.agentId, body.sessionId) })
        case 'agent-archive':
          await rt.load()
          await rt.archiveAgentSession(body.agentId, body.sessionId)
          return ok(true)
        case 'agent-rename':
          await rt.load()
          await rt.renameAgentSession(body.agentId, body.sessionId, body.title)
          return ok(true)
        case 'remove-agent':
          await rt.load()
          await rt.removeAgent(body.agentId)
          return ok(view())
        case 'set-flags':
          await rt.load()
          return ok(await rt.setFlags(body.id, body))
        case 'delete-room':
          await rt.load()
          await rt.deleteRoom(body.id)
          return ok(view())
        case 'approval-answer':
          rt.answerApproval(body.id, body.choice)
          return ok(true)
        case 'stop-member-work':
          return ok(await rt.stopMemberWork(String(body.roomId ?? ''), String(body.botId ?? '')))
        case 'dismiss-question':
          await rt.load()
          if (rt.own(state.questions, body.sessionId) !== undefined) {
            delete state.questions[body.sessionId]
            await rt.save()
          }
          return ok(true)
        case 'secret-set':
        case 'secret-allow':
        case 'secret-cancel':
        case 'secret-update':
        case 'secret-delete':
          await rt.load()
          return ok(await rt.secretEndpoint(endpoint, body))
        case 'connector-connect':
        case 'connector-disconnect':
        case 'connector-retry':
          await rt.load()
          return ok(await rt.connectorEndpoint(endpoint, body))
        case 'capability-save':
        case 'capability-delete':
        case 'capability-approve':
        case 'bot-capability':
          await rt.load()
          return ok(await rt.capabilityEndpoint(endpoint, body))
        case 'schedules':
        case 'schedule-create':
        case 'schedule-delete':
          await rt.load()
          return ok(await rt.scheduleEndpoint(endpoint, body))
        case 'memory-view':
        case 'memory-ask':
        case 'memory-forget':
          await rt.load()
          return ok(await rt.memoryEndpoint(endpoint, body))
        case 'answer-question': {
          if (typeof body.sessionId !== 'string') return fail('Nothing to send', 'bot/invalid')
          await rt.load()
          const past = rt.pastOwners.get(body.sessionId)
          const sessionId = rt.botOf(body.sessionId) ? rt.chatOf(body.sessionId) : past && past.roomId === undefined ? rt.chatOf(past.botId) : body.sessionId
          const targetBot = rt.botOf(body.sessionId) ?? rt.botOf(rt.chatOwners.get(sessionId))
          if (rt.isLocalBot?.(targetBot)) return fail('Local Agent members currently work in group chats. Add this Bot to a group and @mention it there.', 'bot/group-only')
          const question = rt.own(state.questions, sessionId)
          if (question === undefined || question.id !== body.questionId) return fail('This question is no longer open', 'bot/stale')
          const reply = questionReply(question, body.answer)
          if (reply === undefined) return fail('Nothing to send', 'bot/invalid')
          // Claim the question before queueing so a second answer is refused.
          delete state.questions[sessionId]
          try {
            await rt.ensureCapabilities(sessionId)
            const agent = await rt.resolveAgent(sessionId)
            agent.followup(createUserMessage({ content: [{ type: 'text', text: reply.text }], source: reply.source }))
            await ctx.sessions.flush(agent.session)
          } catch (error) {
            state.questions[sessionId] ??= question
            throw error
          }
          await rt.save()
          return ok(true)
        }
        case 'send': {
          const text = String(body.text ?? '').trim()
          if (body.images !== undefined && !Array.isArray(body.images)) return fail('Invalid images', 'bot/invalid')
          const images = body.images ?? []
          if (body.uploadedFiles !== undefined && !Array.isArray(body.uploadedFiles)) return fail('Invalid uploaded files', 'bot/invalid')
          const uploadedFiles = body.uploadedFiles ?? []
          if ((text === '' && images.length === 0 && uploadedFiles.length === 0) || typeof body.sessionId !== 'string') return fail('Nothing to send', 'bot/invalid')
          await rt.load()
          // A Bot id or an earlier part of its own chat means the current part.
          const past = rt.pastOwners.get(body.sessionId)
          const sessionId = rt.botOf(body.sessionId) ? rt.chatOf(body.sessionId) : past && past.roomId === undefined ? rt.chatOf(past.botId) : body.sessionId
          const targetBot = rt.botOf(body.sessionId) ?? rt.botOf(rt.chatOwners.get(sessionId))
          if (rt.isLocalBot?.(targetBot)) return fail('Local Agent members currently work in group chats. Add this Bot to a group and @mention it there.', 'bot/group-only')
          await rt.ensureCapabilities(sessionId)
          const content = text === '' ? [] : [{ type: 'text', text }]
          content.push(...await importMobileFiles(rt, sessionId, uploadedFiles, signal))
          if (images.length > 0) {
            const attachments = ctx.get?.('attachments')
            if (typeof attachments?.saveImages !== 'function') return fail('Image uploads are unavailable', 'bot/unavailable')
            // Match the native upload format; the attachment store enforces image and batch limits.
            const limits = attachments.imageLimits
            const maxCount = limits?.maxImagesPerMessage ?? 20
            const maxBytes = limits?.maxImageBytes ?? 20 * 1024 * 1024
            const maxTotalBytes = limits?.maxMessageImageBytes ?? 200 * 1024 * 1024
            if (images.length > maxCount) throw invalid('Too many images')
            let totalBytes = 0
            for (const image of images) {
              if (typeof image?.data !== 'string') throw invalid('Invalid image upload')
              const bytes = Math.ceil(image.data.length / 4) * 3 - (image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0)
              totalBytes += bytes
              if (bytes > maxBytes || totalBytes > maxTotalBytes) throw invalid('Image upload is too large')
            }
            const inputs = images.map(image => {
              if (image === null || typeof image !== 'object' || typeof image.data !== 'string'
                || typeof image.mediaType !== 'string' || (image.name !== undefined && typeof image.name !== 'string')) throw invalid('Invalid image upload')
              const data = Buffer.from(image.data, 'base64')
              if (data.length === 0 || data.toString('base64') !== image.data) throw invalid('Invalid image base64')
              return { data: new Uint8Array(data), mediaType: image.mediaType, ...(image.name === undefined ? {} : { name: image.name }) }
            })
            content.push(...inputs.map(image => ({ type: 'image', data: Buffer.from(image.data).toString('base64'), mediaType: image.mediaType, ...(image.name === undefined ? {} : { name: image.name }) })))
          }
          await ctx.sessionController.prompt({
            requestId: randomUUID(),
            sessionId,
            mode: 'queue',
            content,
          }, AbortSignal.timeout(30_000))
          return ok(true)
        }
        case 'update-check': {
          const fresh = body.fresh === true
          return ok({ ...(await rt.updateCheck({ fresh })), dsh: (await rt.dshUpdateCheck?.({ fresh })) ?? null })
        }
        case 'update-install':
          return ok(rt.updateStart())
        case 'dsh-update-install':
          return ok(rt.dshUpdateStart?.())
        case 'repo-stars':
          return ok(await rt.repoStars())
        // The Desktop window's long poll for read_browser, and its answers.
        case 'browser-wait': {
          if (rt.browserChannel === undefined) return fail('Bot browsers are off on this host', 'bot/browser-off')
          const clientId = typeof body.clientId === 'string' ? body.clientId.slice(0, 100) : ''
          if (clientId === '') return fail('A browser poll needs a clientId', 'bot/invalid')
          await rt.load()
          return ok(await rt.browserChannel.wait(clientId, rt.browserOpen(body.open)))
        }
        case 'browser-result':
          if (rt.browserChannel === undefined) return fail('Bot browsers are off on this host', 'bot/browser-off')
          return ok(rt.browserChannel.result(body))
        case 'diagnostics':
          await rt.load()
          return ok(await rt.diagnostics.report(body))
        case 'diagnostics-log':
          return ok(await rt.diagnostics.logText())
        case 'diagnostics-clear':
          await rt.diagnostics.clear()
          return ok(true)
        default:
          return fail(`Unknown endpoint ${endpoint}`, 'bot/not-found')
      }
    } catch (error) {
      const code = errorCode(error)
      const baseMessage = error?.message ?? String(error)
      const message = baseMessage === 'prompt rejected' && typeof error?.details?.reason === 'string'
        ? `${baseMessage}: ${error.details.reason}` : baseMessage
      if (code === 'bot/internal') rt.noteFailure({ source: 'api', text: `${endpoint}: ${message}`, code: error?.code ?? error?.name, stack: error?.stack })
      return fail(message, code)
    }
  }

  // An exact Fetch route on the shared /api channel; the browser authenticates with its session cookie.
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body
      try { body = await request.json() } catch { body = {} }
      const result = await handle(String(body?.endpoint ?? ''), body?.payload, request.signal)
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  }), 'ds-bot: api route')

  ctx.effect(() => {
    void rt.load()
    return () => {}
  }, 'ds-bot: load state')
}
