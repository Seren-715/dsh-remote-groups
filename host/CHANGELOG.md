# Changelog

All notable changes to DS Bot are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/). Before 1.0, a minor version can contain breaking changes.

## [Unreleased]

## [0.1.7] - 2026-10-16

### Added

- **Bots see what their teammates are doing**: `list_bots` says what each other Bot is doing now: waiting for your approval, moving to a fresh conversation, working (in its own chat or which group, for how long, for whom, on which tool), or waiting for teammates to hand back work, and whether a question card waits for you or messages wait unread. `message_bot` says the same about the Bot it messages. ([#262](https://github.com/Fei2411/DeepSeek-Bot/issues/262))
- **Hand-offs that come back**: a Bot that hands part of a request on to other Bots, or posts in a group and asks for the replies, answers the Bot that asked only once all of it is back, and its answer carries what came back. A Bot can take part in the same work more than once, for example one designs, another builds, a third reviews and the first accepts. ([#262](https://github.com/Fei2411/DeepSeek-Bot/issues/262))
- A Bot's character shows when it waits for teammates to hand back work: it sways with its eyes circling, without the working dot, and its sidebar row says whom it waits for. ([#262](https://github.com/Fei2411/DeepSeek-Bot/issues/262))
- **Docker image**: run DS Bot on a NAS or another always-on machine, with a Compose file you configure inline, a Linux start script, and a setting to change who owns the data. See `docker/README.md`.

### Changed

- Bots are no longer stopped by counts: a chain of six forwarded messages, 10 unread messages, three rounds a Bot starts in one group, and 40 Bot messages since you last wrote no longer apply. The only message refused is one to the Bot that waits for the result of the current work, since the result goes to it by itself. Messages a Bot has not read yet from the same Bot, for the same work, join into one message that it answers once. ([#262](https://github.com/Fei2411/DeepSeek-Bot/issues/262))
- Work handed out in a group chat stays in that group: Bots called there with `message_bot` work in the group, as with @Name, and Bots outside the group are no longer pulled in through their own chats. ([#165](https://github.com/Fei2411/DeepSeek-Bot/issues/165))
- Long messages: a Bot's message or group post past 20,000 characters goes as a file the other Bots read; long messages in the chat fold to their first lines with **Show all**, also in the Bot exchange dialog; and they no longer make the team file grow and slow down every save. ([#206](https://github.com/Fei2411/DeepSeek-Bot/issues/206))
- The reasoning above a Bot's answer shows its last five lines and scrolls for the rest, instead of opening the whole chain of thought.
- The settings dialog keeps one size on every page, the Usage page's, so it no longer grows when you open Usage.
- Unread dots, the "New" divider and the new-messages pill take your accent color, and text on the accent turns dark when that reads better.
- Danger actions and error messages use one red.

### Fixed

- Files you send in a group chat, such as PDFs, now reach the Bots there, and they can read them as in a private chat. ([#176](https://github.com/Fei2411/DeepSeek-Bot/issues/176))
- A Bot that asks a group member for work now always hears when the work is done, also when the member's result came out as its first message. ([#185](https://github.com/Fei2411/DeepSeek-Bot/issues/185))
- Deleting a Bot while it works no longer leaves it shown as thinking, and Bots that were waiting for its reply are told it was deleted. ([#124](https://github.com/Fei2411/DeepSeek-Bot/issues/124))
- A group member whose conversation in the group cannot be opened now shows "could not answer" in the group and gets a new conversation there, instead of staying silent. ([#163](https://github.com/Fei2411/DeepSeek-Bot/issues/163))
- Deleting a Bot while a group is made or changed no longer leaves it in the group; two changes to one group at once no longer drop each other's members; a group left with one Bot can still change its settings. ([#200](https://github.com/Fei2411/DeepSeek-Bot/issues/200), [#205](https://github.com/Fei2411/DeepSeek-Bot/issues/205))
- Bots and group chats created at the same time can no longer end up with the same name. ([#148](https://github.com/Fei2411/DeepSeek-Bot/issues/148), [#199](https://github.com/Fei2411/DeepSeek-Bot/issues/199))
- A Bot can no longer be named "User" or "You", which group chats use for you. ([#178](https://github.com/Fei2411/DeepSeek-Bot/issues/178))
- A model you pick for a Bot while it starts a new part of its conversation now applies to that part and every part after it. ([#159](https://github.com/Fei2411/DeepSeek-Bot/issues/159))
- When a Bot's or a group's working folder is deleted or renamed, the Bot goes on in the team workspace instead of falling silent, and a group round no longer waits minutes for a member whose turn failed before it started. ([#209](https://github.com/Fei2411/DeepSeek-Bot/issues/209))
- A relative file link that a Bot posts in a group chat with a working folder, or sends to another Bot, now opens. ([#217](https://github.com/Fei2411/DeepSeek-Bot/issues/217))
- A reaction on a message in a group chat now stays on that message only. ([#212](https://github.com/Fei2411/DeepSeek-Bot/issues/212))
- Reactions and unread marks set in one DSH tab or window now stay when you use another one, and show there at once. ([#215](https://github.com/Fei2411/DeepSeek-Bot/issues/215))
- `web_search` uses the model's own search again on OpenCode and OpenCode Go routes, instead of always falling back to the keyless results page. ([#184](https://github.com/Fei2411/DeepSeek-Bot/issues/184))
- Switching to classic Agent mode now removes the whole Bot skin even when another plugin shadows the same controls, such as dsh-codex-subscription's model picker. ([#149](https://github.com/Fei2411/DeepSeek-Bot/issues/149))
- The right sidebar (workspace files, terminals) has a button in Bot mode again, at the right of the conversation header. ([#172](https://github.com/Fei2411/DeepSeek-Bot/issues/172))
- In Bot mode, the sidebar can be collapsed with a button and brought back after a narrow window collapses it, also under the Windows title bar. ([#211](https://github.com/Fei2411/DeepSeek-Bot/issues/211))
- In Bot mode, entries that other plugins add to the sidebar footer get a row each, instead of squeezing Connect plugins. ([#164](https://github.com/Fei2411/DeepSeek-Bot/issues/164))
- **Report on GitHub** in Settings → Feedback opens the new issue in your browser from DSH Desktop too. ([#182](https://github.com/Fei2411/DeepSeek-Bot/issues/182))
- Preset accent colors use their dark shade in dark mode, so Charcoal, Graphite and Cobalt stay visible.
- DS Bot no longer writes its diagnostics log after it stops. ([#226](https://github.com/Fei2411/DeepSeek-Bot/issues/226))

## [0.1.6] - 2026-10-15

### Added

- **Group permissions**: a group chat can run all its members with one permission preset (Read only, Workspace or Full access) in place of each member's own. Turn on **Same for every member** under Permissions in the group's settings; the group's details show the preset while it is on. Members' conversations in the group change at once, and a member's later conversations there start on it. Turned off, each member works with its own preset again.

### Changed

- A Bot at work in a group chat no longer stays silent until it is done: it says what it will do, keeps the group posted as it goes, and ends with the result.
- The work status in the group, the sidebar and a Bot's own chat says what the Bot is doing, instead of only "On it", also while it moves to a fresh conversation.

### Fixed

- In a group chat, what a Bot did after one of its background jobs finished, or after it moved to a fresh conversation, never reached the group. It now does.
- Bots could keep messaging each other for a long time without you, for example by forwarding a request from Bot to Bot or through group posts. Every forwarded message and group post now counts toward the limit on how long a chain of Bot messages can get, and after 40 Bot messages since you last wrote, answered a question card or a scheduled task ran, `message_bot` and `post_to_group` fail and tell the Bot to report to you. Bots are also told not to send thanks or acknowledgements, and not to answer a reply. ([#129](https://github.com/Fei2411/DeepSeek-Bot/issues/129))
- An HTTP MCP capability with `$DSH_SECRET_<NAME>` in its URL sent the reference itself to the server and showed ready until the first tool call failed. The URL now gets the secret's value, URL-encoded, and a capability whose Bot may not use the secret shows an error. ([#125](https://github.com/Fei2411/DeepSeek-Bot/issues/125))
- Group chats now relay messages to their Bots with the `ptc` agent preset, DSH Desktop's default. New Bot chats, group chats and conversation parts use the `standard` preset. A group chat made under `ptc` still relays, but each of its rounds is limited by DSH's time limit for a program run, about 10 minutes. ([#37](https://github.com/Fei2411/DeepSeek-Bot/issues/37))
- Bot chats and group chats no longer run DeepSeek Harness goals. A goal started there with `/goal` is stopped at once with a short note, so a group chat no longer runs round after round, and the chat shows no goal rounds. ([#133](https://github.com/Fei2411/DeepSeek-Bot/issues/133))
- With a plugin that re-skins DSH's composer or sidebar installed alongside, such as `@michengai/dsh-codex-ui`, a Bot chat's message box keeps its one-line height, its button spacing and its "Message <Bot>" placeholder, and the sidebar footer keeps the account button and Connect plugins on one row. ([#127](https://github.com/Fei2411/DeepSeek-Bot/issues/127))
- Opening and closing the details panel no longer stutters in a long chat, most of all in a group chat. On every frame of the glide the whole conversation was styled again, because of a width that DSH writes on the conversation at every resize and that Bot chats do not use. The conversation still glides with the panel, and each frame now restyles only what changes.
- In a group chat, each member at work had a row of its own above the message box, which ran over the messages behind it. One capsule above the message box now says who waits for your approval and who is at work, and opens the group's details. A Bot's own chat shows the groups it works in the same way.
- A group's details panel no longer puts badges on the members' marks or a member's work on a loose line under its row. Each member has one row with its mark, name, Admin tag and what it is doing, Stop beside it while it works in the group, and the approvals it waits on below. The group shows its first members side by side, and the tab row that only held Details is gone.

## [0.1.5] - 2026-10-13

### Added

- **Working folder**: a Bot can work directly in a folder you choose instead of the team workspace. Set it in the Bot's settings or details panel: type a path, pick one of your DSH projects, or browse. A group chat can set one folder for all its members there. You can also ask a Bot to change its own folder, or a Main Bot to change any Bot's or group's folder. A Bot that sets a folder outside the team workspace, or adds a Bot to a group that works in one, asks for your approval first when those Bots can only write in their folder. After a change, the Bot's chat goes on in a fresh part that starts in the new folder.

### Fixed

- A new Bot asks where to start in its first reply instead of on a question card, and follows its own instructions where they say otherwise.
- Bots no longer use DeepSeek Harness's own question card, which held the Bot until you answered it while messages from other Bots waited.
- A Bot that messaged a Bot stuck on earlier work was told "Delivered" every time, with no sign that nothing was read. It is now told how many earlier messages wait unread and when the other Bot waits for your approval, and after 10 unread messages `message_bot` fails and tells it to report the stuck Bot to you.
- On model providers that need every request to name its conversation, such as OpenCode Go, the memory panel, automatic memory updates, the context check of long chats and image reading for text-only models failed. They now work there too.
- The memory panel's summary, its "ask or update" and the memory review no longer stop when the Bot's model refuses the call or runs out of output budget: they try once more on the profile's default model. After you change the Bot's model, a failed summary is written again automatically. ([#116](https://github.com/Fei2411/DeepSeek-Bot/issues/116))
- With the `ptc` agent preset, the team view and a Bot's character show the tool the Bot runs from its code, an approval card says what that tool does, and a question card asked from code is kept in chat search and in the next part of the chat. In a group chat, a member that only reads the chat or checks the team no longer leaves the round as if it had gone off to work.
- Switching from Bot mode back to Agent mode no longer leaves parts of the Bot interface on screen, such as the chat header or Bot messages without their styles, when one part fails to close. The other parts still close, and Bot mode opens normally again.
- DS Bot no longer sets DeepSeek Harness's work-details mode (Settings → General) to the most detailed one, and no longer hides that setting. Bot chats stay flat in every mode, and your choice applies again outside them. If you had chosen another mode before, choose it again once: DS Bot cannot tell which one it was.
- Your own messages in a Bot chat stay readable under dark skins that recolor message bubbles.
- A Bot chat now shows the cards of the files a Bot hands over with DeepSeek Harness's `present` tool, and of the files a turn changed, as DSH's own chat does. A file path in the reply links to the file when the turn made or delivered it.
- With the `ptc` agent preset, the chat shows the tools a Bot runs from its code again: group replies, question and key cards, and the lines for messages, Bots, groups and memory.
- A question or key card whose call is not on screen, such as one asked in an earlier part of the chat or in a Bot-to-Bot turn, waits above the message box. A card shows in one place only.
- With `DSH_HOME` empty or starting with `~`, DS Bot now keeps its data in `bot/` inside the folder dsh uses. Before, it used a folder relative to the one dsh was started in; to keep a team made that way, close dsh and move that `bot/` folder into dsh's folder.

## [0.1.4] - 2026-10-13

### Added

- Settings → **Capabilities**: share MCP servers and skills with the team, group them into packs, and choose which capabilities each Bot can use.
- A Bot that was working when DeepSeek Harness closed or restarted picks its work back up when DS Bot starts again. A group chat shows which member was cut off, and a Bot that was answering another Bot still sends its answer.
- The sidebar marks a Bot or group chat that waits for your approval. Where the system allows notifications, a notification also names the Bot.
- In a group chat, any Bot can hand work to another with @Name. The Bot does the work without holding up the group, and the group, the sidebar and the Bot's own chat show what it is doing. When it is done, it posts the result in the group. You can stop the work in the group's details.

### Changed

- What a group member posts after its round moved on is answered by the Bot that asked for the work, and no longer by the admin. Work you asked for yourself is left for you to read.

### Fixed

- When a model wrote its tool call as text instead of making it, nothing ran and the Bot stopped as if it were done. The Bot is now asked once to make the call, and the text of the call is kept out of group chats.

## [0.1.3] - 2026-10-12

### Added

- In a Bot's chat or a group chat, `@` lists the Bots you can mention first: a group's members and **Everyone**, or the other Bots. Picking one writes `@Name`.
- **Reference a chat** in the composer's **+** menu adds another Bot's chat, or a recent conversation outside the team, to your message as context.
- A Main Bot can stop another Bot's running turn. The Bot is told why, and its reply goes back to the Main Bot.
- In a group chat, a member that asks for an approval no longer holds up the round. You allow or reject the request in the group's details panel, and a line above the composer names the members who are waiting or at work. What a member says after the round moved on is posted in the group.

### Changed

- When a Bot messages another Bot that is working, the message reaches it at its next step instead of waiting until its current work is done. It answers once that work is done, and the reply comes back. A Bot can still queue a separate task behind the current work.
- Bots give a brief progress message when starting a multi-step task in their own chat with the user, and at meaningful milestones on long tasks.
- Every Bot can change its own name, role, color, model and instructions; only a Main Bot changes other Bots.
- Updating a copy installed from GitHub uses the repository's current address.
- The Usage page groups its statistics, chart, rankings and activity into one panel.
- Hover over an Activity day to see its token count.

### Fixed

- When DS Bot cannot save the Bot team, the change now fails with an error instead of being lost silently.
- A Bot team file that cannot be read is no longer replaced by an empty team; a damaged file is kept as a backup.
- Warnings in the host log hide keys and tokens.
- Bots receive the current time on their first model step and refresh it after ten minutes, even when their DSH preset does not supply a clock.
- In a group chat, a conversation referenced in a message reached none of the members, and a reference whose title started with a member's name called that member. Now the members who answer the message get the referenced conversation.
- In a group chat, typing `@` and a Bot's name and pressing Enter inserted a conversation reference instead of the Bot's name.
- Deleting a Bot or group chat also removes its scheduled tasks, including ones left on the Bot's earlier chat parts. Before, armed tasks stayed active and kept running the deleted Session; the archive that would have stopped them was refused and the failure was silent.
- A long conversation's fresh part keeps the Bot's model and thinking level. Before, the new part fell back to the default model.
- A provider adapter that cannot measure tokens no longer fails every turn. The context size is estimated instead, with one warning in the log.
- When the recent errors were too long for **Report on GitHub**, the new issue got no diagnostics at all. Now it keeps the versions, the system and the models, and only the errors go by the clipboard.
- The memory panel's summary works on models that think by default. The call asks for the model's lowest thinking level, and when the answer is cut off at the output limit it is written once more with a larger budget instead of failing or being saved half-written.
- A message sent to a group chat while a round is running joins that round before the next member speaks. Everyone still to speak sees it, and the members it is for answer it in the same round. Before, it waited for the whole round to end. A message with images or a referenced conversation still waits for its own round.
- In your own messages, `@Name` of a Bot shows as that Bot and opens its chat, instead of a file named after the first word. A group chat calls exactly the Bots a message shows as called: code, links, web addresses and file references such as `@docs/guide.md` call nobody.
- A Bot chat no longer stays stuck when the model keeps turning down its requests, for example over an image it cannot read. Images from finished turns are no longer sent with every later request. When a request is turned down on two turns in a row, the Bot moves on to a fresh conversation part and tells you that the last message could not be sent.

## [0.1.2] - 2026-10-11

### Added

- Settings → About DS Bot: the DS Bot and DSH versions, **Check for updates** and the update buttons, and links to the source code, the release notes and the feedback page. A **Star** button opens the GitHub repository and shows its star count.

### Fixed

- The update card offers a DSH update only when a DS Bot release names a verified DSH version. DS Bot 0.1.1 offered DSH `0.2.1-alpha.1`, which was not verified. In DSH Desktop the card shows a DSH update only when the update the app offers is the verified version.

## [0.1.1] - 2026-10-11

Tested with DeepSeek Harness `0.2.1-alpha.1` (DSH Desktop and DSH Web).

### Added

- Voice chat uses the local speech recognition of the official DSH Voice Input plugin (SenseVoice) when the plugin is on, and the browser's speech recognition otherwise. When the plugin has no speech model yet, the voice panel opens its settings.
- The update card also offers DSH updates, but only the DSH version that the newest DS Bot release was verified with (`dsBot.verifiedDsh`). A DSH installed with npm updates in one click; DSH Desktop opens its own update panel.
- Each Bot can pick a thinking level with its model, in the model menu or when the Bot is created. **Default** uses the model's own level.
- A permission setting in each Bot's details panel: **Read only**, **Workspace** or **Full access**, from the presets DSH offers. The Bot keeps it in its own chat, its group chats and its new conversation parts.

### Fixed

- A handoff note whose headings the model translated (for example `## 目标`) is kept, with the headings put back in English, instead of being written again. A note with a repeated or missing heading is still written again. Handoff notes keep file paths in full.
- Group the first model choices by provider, so models with the same name can be distinguished. Providers with the same display name also show their provider IDs.
- A turn with many steps shows one "Thought it through" row instead of one per step. The row holds the thinking of every step in order.
- The Usage page counts the calls of subagent Sessions too. Before, each scan skipped them and wrote one warning per subagent Session to the terminal.

## [0.1.0] - 2026-10-10

The first public preview. Tested with DeepSeek Harness `0.2.1-alpha.1` (DSH Desktop and DSH Web).

### Added

- A team of long-lived Bots. Each Bot is a DSH Session with its own name, role label, instructions, model and character. Every Bot runs on one model of its own, chosen from the models configured in DSH (the `list_models` tool lists them). Creating a Bot opens a form: pick its look, its model (the DSH default model comes first) and its name.
- Main Bots that create, change and remove other Bots. You can have more than one Main Bot, change the Main Bot in one step on Settings → Bots, and move one to the front; there is always at least one. A Main Bot wears a large star on its avatar.
- Messages between Bots, questions to you that do not stop the other Bots, and a view of what each Bot is doing.
- Group chats in which members speak in turn, can be called with `@name` and stay silent when they have nothing new to add. A new group chat starts with its admin, who wears a small star and manages the group. Every group chat has its own settings page: name, notice, who answers, members and admin, pin and hide, and delete.
- The DSH Agent: one plain DSH entry in the sidebar beside the Bots, with its own Sessions on the native DSH conversation page and none of the team tools.
- Long conversations that stay inside the model's window. The context lines follow the model's `contextWindow` (500,000 tokens when a model reports none), and the check line is a share of it (`checkRatio`, default 0.8). When a turn ends past the check line, a small separate model call decides once: condense the conversation in place into a checkpoint (a handoff summary plus the user's recent messages word for word) while the work is under way, or let the Bot write a handoff note and continue in a new part when the work has reached a stopping point. Neither leaves a marker in the chat. DSH's own compaction does not run on Bot conversations. Earlier parts and condensed messages stay in a local full-text index that the Bot can search.
- Memory. Each Bot keeps notes across all its conversations (`MEMORY.md` and topic files in the Agent Memory Repo format), and the team shares one more memory that Main Bots and group admins write. Bots use the `remember`, `forget` and `recall` tools, and after each turn the Bot's model reviews what is new and keeps, updates or removes entries itself (`memoryReview: false` turns this off). Each conversation reads the memory once, when it starts, so the prompt cache holds. Sizes are fixed, keys and tokens are refused, and `memory/journal.jsonl` keeps every change. `memory: false` turns memory off.
- The memory panel, opened from the Memory row in a Bot's details panel or settings, or from "Memory updated" in its chat: a summary that the Bot's model writes from the entries, every entry with remove, and "Ask or update" to ask about the memory or change it in plain words.
- Scheduled tasks for Bots and group chats: once, every day, every week on chosen days, or every so many minutes, hours or days. Add them from Settings → Scheduled tasks or from **Scheduled task** in the composer's **+** menu. A task sends its message to the chat when it is due. The tasks run on DSH's Automation tasks.
- A Usage page in Settings: token usage over the last 24 hours, 7 days, 30 days, 12 weeks or 12 months, or over days picked on a calendar, with the change from the period before, a chart by Bot or by model, a ranking of Bots and models, and a year of daily activity. Each Bot and each model opens its own page. The counts are kept in `usage.sqlite`. Tokens only, no cost.
- A Connectors page in Settings, with GitHub as the first connector: paste a GitHub token to use GitHub's tools for repositories, issues and pull requests. The token is kept as the `GITHUB_TOKEN` secret. `github: false` hides it.
- The `auto` web-search provider: the native search of the current model route, with a keyless fallback to public results pages.
- A Bot browser in DSH Desktop: each Bot has its own browser with tabs and its own storage partition, in the same side panel as the Bot's details. The Bot reads the open page as structured Markdown (headings, lists, tables, code blocks, open Shadow DOM, same-origin frames) and never reads password, card or one-time-code values.
- Secret cards: a Bot asks for an API key or token in its own chat, you choose which Bots may use it, and the Bot gets it only as a shell environment variable. Saved values are hidden as `[secret:<NAME>]` in tool results and model requests. Settings → Secrets manages them.
- Text descriptions of images for models that cannot read images, made by a configured model that declares image input.
- Customization of the name, role label, instructions, model, character, theme and accent color. The first Main Bot is a whale in DeepSeek blue.
- Avatar animation in three levels (Settings → Bots → Animation): **Quiet**, **Normal** (the default) and **Lively**. Panels, menus and controls move on springs.
- Settings with pages for General, Bots, Group chats, Connectors, Scheduled tasks, Usage, Secrets and Feedback.
- The interface follows the DSH language (English or Chinese).
- **Classic Agent mode** (Settings → General) gives the window back to the native DSH interface; the **DS Bot** button at the bottom of the sidebar brings the team view back.
- Settings → Feedback: the DS Bot and DSH versions, the system and the recent errors, with **Report on GitHub**, **Copy**, **Download** and **Clear**. Keys, tokens, saved secrets and the home folder are removed from the text. Errors are also written to `<home>/logs/diagnostics.jsonl` (`diagnosticsFile: false` keeps them in memory only), and a failed request shows a short notice with a **Details** link.
- Update checks: DS Bot looks for a newer release where it was installed from (the npm registry, or GitHub for a versioned git install) and shows a cloud button at the sidebar's top right when one exists. One click installs it; the new version runs from the next DSH start. `updateCheck: false` turns the checks off.
- One writer per team: when DSH Web and DSH Desktop share a DSH home, the second one opens the team read-only, says why, and takes over when the first one quits.

If you used the legacy `dsh-bot` package, remove it before you install `ds-bot`. The team data stays in `<DSH_HOME>/bot`, and the theme, Bot colors and browser settings move over the first time DS Bot opens.

### Known limitations

- Tested with DSH `0.2.1-alpha.1`, mainly on Linux and in DSH Web. DSH is an alpha, and a newer DSH can break the plugin.
- The Bot browser is in DSH Desktop only, and Bots can only read pages ([Bot browser](ds-bot/README.md#bot-browser)).
- Secrets are stored without encryption, and only exact copies of a value are hidden ([Secrets](ds-bot/README.md#secrets)).
- Only one DSH can change a team at a time; a second DSH on the same DSH home opens it read-only ([Data and backups](ds-bot/README.md#data-and-backups)).
- Group chats use many tokens: each member reads the group and answers in turn.

[Unreleased]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Fei2411/DeepSeek-Bot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Fei2411/DeepSeek-Bot/releases/tag/v0.1.0
