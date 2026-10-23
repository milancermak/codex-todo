# Local installation records

Numbering begins with recorded history. The first seven installations predate the Git repository. Historical machine paths are redacted in this public copy; the private original is retained outside version control. `unknown..unknown` indicates that Git source boundaries cannot describe these non-Git artifacts. Builds and localhost preview runs are not counted. Historical source hashes identify the revisions captured at installation time, before the public history was squashed into one initial commit; those earlier objects may not appear in published history.

## 1 — Todo 0.1.0 local installation

- Completion time: unknown. Installation was verified at 2026-10-20T09:03:48Z; that is a later verification time, not an asserted installation completion time.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled. Official MCP client successfully initialized the cached bundle, discovered six tools and both entrypoints, read the HTML resource, and loaded the saved project mappings. Native sidebar rendering remains unverified.
- Source boundary: `unknown..unknown`; non-Git source and artifact.
- Artifact: version `0.1.0`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.1.0`.
- SHA-256: `dist/index.html` = `4c79dbe2a36763e3bcfaed0905d6ff8c0d7352a91bb4cd065dae6aa6348f45a5`; `dist/server.mjs` = `0eaaa251d1f70df83c9a10e0e48c4b11430200894beba2760106d13aecd4e19f`.
- Summary: installed the first local TODO board with SQLite persistence, project mapping, MCP App entrypoints, and prepared native chat links.

## 2 — Todo 0.1.1 local installation

- Completion time: 2026-10-20T09:07:21Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled; the cached 0.1.1 bundle initializes, exposes six tools, and serves the embedded UI. The user confirmed that the board opens in Codex. Native project-chat handoff remains a manual acceptance check.
- Source boundary: `unknown..unknown`; non-Git source and artifact, transitioning from plugin artifact 0.1.0 to 0.1.1.
- Artifact: version `0.1.1`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.1.1`.
- SHA-256: `dist/index.html` = `faa4fe4765a80a66f0678587a8c5301dc9720f4f025807330d20c45c323d9bec`; `dist/server.mjs` = `be6313971e369e861eb6b31ba9a7ce186d92ba61f8e8ee87b7d1d0397742e8a2`.
- Validation: five tests pass; browser acceptance covers capture, edits, completion/restore, project assignment/removal, filtering, persistence, validation errors, and deletion cleanup. The dark layout was visually checked at normal size and 320 pixels wide. Test records were removed, retaining seven project mappings and an empty task list.
- Summary: updated the prototype with final dialog styling, accurate chat-launch feedback, input limits, keyboard focus recovery, and protection against stale or unchanged board responses.

## 3 — Todo 0.2.0 local installation

- Completion time: 2026-10-20T13:07:58Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled; read-only Codex app-server discovery found enabled `codex-todo:todo` and `codex-todo:today` skills in the installed cache with no plugin skill errors.
- Source boundary: `unknown..unknown`; non-Git source and artifact, transitioning from plugin artifact 0.1.1 to 0.2.0.
- Artifact: version `0.2.0`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.2.0`.
- SHA-256: `dist/index.html` = `cb764c73756c220f22cd9c53cf8642692de8a34276d2503c8fd5f9ff95e4829a`; `dist/server.mjs` = `24caacd4d6c75f2948f66f982b76144f23becf4226c248a6c013f23ce326ea2b`; `skills/todo/SKILL.md` = `a4dc9c9000bc5443d88100ff29decd1349524734b62f39a39b86b00f5c63e332`; `skills/today/SKILL.md` = `5eb0e755eeb1c869933d99285f6b5b6db918c2deef3332d2005928230b4f2dfd`.
- Validation: fifteen automated tests pass. Browser checks cover the requested removals, stacked Today/Backlog sections, single-field edit, exact multiword tags, explicit typo confirmation with a preselected project, completion/restore, search, reload persistence, and deletion cleanup. All user project mappings were retained. No model turn or new chat was started for skill verification.
- Summary: installed the simplified two-section board, shared project-tag capture parser, and bundled todo/today skills; runtime discovery then revealed the namespaced skill prefixes addressed by the next release.

## 4 — Todo 0.2.1 local installation

- Completion time: 2026-10-20T13:09:21Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled. Read-only app-server discovery confirms both capture skills enabled from the 0.2.1 cache without errors. An official MCP client initialized the actual installed server, discovered seven tools, read the v2 UI resource, and captured the namespaced Today example correctly in an isolated test database.
- Source boundary: `unknown..unknown`; non-Git source and artifact, transitioning from plugin artifact 0.2.0 to 0.2.1.
- Artifact: version `0.2.1`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.2.1`.
- SHA-256: `dist/index.html` = `79e299da5c9a4f7270cada44522a9e95fd4b899a92a9e21d46c4be9cd3755eb8`; `dist/server.mjs` = `8307a5d2b8538c948775989ef881fa638f7a1c6e4d421aee3f6c21552b392b39`.
- Validation: all fifteen tests pass, including `$codex-todo:today` and `$codex-todo:todo` prefixes. Existing browser acceptance applies to the unchanged layout; the final preview was restarted and reloaded, disposable tasks removed, and seven original project mappings retained.
- Summary: aligned capture with Codex's actual namespaced bundled-skill identifiers while preserving the simplified Today/Backlog UI and multiword project tagging.

## 5 — Todo 0.2.2 local installation

- Completion time: 2026-10-20T13:22:46Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled. An official MCP client consumed the actual installed bundle and both bundled skills were discovered enabled from its cache without errors. The stale 0.2.0 Todo process responsible for the reported native failure was subsequently stopped to allow reconnection. The user subsequently retried the native board and confirmed: “The board opens.” Native reopening is verified.
- Source boundary: `unknown..unknown`; non-Git source and artifact, transitioning from plugin artifact 0.2.1 to 0.2.2.
- Artifact: version `0.2.2`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.2.2`.
- SHA-256: `dist/index.html` = `c0a87ceb97d7ec0d096a400db4928014cac5ee6385c9e0b63fceefe380c1f7c0`; `dist/server.mjs` = `c017a9f2e1bbeb8882b1ea0da9a09ffd2d1b1ceffa32e36bc4ab924c7c9bc09a`.
- Validation: sixteen tests pass, including a bundled stdio resource read after removing its temporary installation folder and compatibility with the earlier v1 resource URI. Browser checks confirm the five annotations, exact placeholder, removed empty actions, 15-pixel headings, and no overflow at 320 pixels. Live tasks and project mappings were not modified.
- Summary: retained the UI in memory across plugin cache cleanup and preserved old resource links; moved capture controls, added the hashtag hint, removed empty-state actions, and enlarged section labels.

## 6 — Todo 0.2.3 local installation

- Completion time: 2026-10-20T13:44:41Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled. Browser acceptance and an official MCP consumer audit of the actual installed bundle passed; the previous sidebar server connection was refreshed so reopening can load the new UI. Native visual acceptance of this version remains unverified.
- Source boundary: `unknown..unknown`; non-Git source and artifact, transitioning from plugin artifact 0.2.2 to 0.2.3.
- Artifact: version `0.2.3`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.2.3`.
- SHA-256: `dist/index.html` = `a350c68a2e0236ca55eac5966ad1f1ddb6c774c504a73c0e2dfadf1b278a3ba8`; `dist/server.mjs` = `f53e4a0a92609f457ebb9f79ed06dd3bb0c945fa3770c96ef88ec4a1ede36928`.
- Validation: twenty-one tests pass. Browser checks cover live exact/partial matching, popup opening, directive overrides, actual saved destination, polling stability, non-sticky detection, multi-tag clearing, prose preservation and a 320-pixel layout without overflow. Isolated test data was removed; the user's live draft was preserved and live tasks were not changed.
- Summary: made the single routing row interactive with compact green text pickers, synchronized hashtag detection and explicit choices, removed duplicate controls and the keyboard hint, and retained older UI resource aliases.

## 7 — Todo 0.2.4 local installation

- Completion time: 2026-10-20T13:55:26Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled. Browser acceptance and an official MCP audit of the actual installed bundle passed. The previous sidebar connection was refreshed so reopening can load this version. Native visual acceptance remains unverified.
- Source boundary: `unknown..unknown`; non-Git source and artifact, transitioning from plugin artifact 0.2.3 to 0.2.4.
- Artifact: version `0.2.4`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.2.4`.
- SHA-256: `dist/index.html` = `de68508141f5c20eebc182c76a377e3277a99a698d9bd566c503d2e97ec7ec68`; `dist/server.mjs` = `98ae245b8c51bc3a1764ad3f5dbd109c6f169591119ab11be14caef679caacc8`.
- Validation: twenty-one tests pass. Browser checks verify exact/partial coloring, no unmatched help on input or Enter, native undo and visible selection, safe literal text, multiline/quoted tags, scroll synchronization and 320-pixel wrapping without overflow. Installed consumer audit verifies seven tools and identical valid v1-v4 resource HTML. The live draft was preserved and tasks were not modified.
- Summary: removed unmatched-project explanations and colored exact project tags green while preserving native textarea editing and compact routing controls.
- Post-install recovery: native reads at 2026-10-20T13:57:23Z–13:57:40Z failed because the current sidebar process still ran 0.2.3 and could not serve v4. The earlier reset had stopped a retired connection. The actual current thread/process was identified after installation and rechecked immediately before its reset; the user then retried and confirmed: “The board opens.” Native reopening after recovery is verified. No new installation or artifact change occurred. Future local updates follow the documented desktop restart lifecycle before native acceptance.

## 8 — Todo 0.3.0 local installation

- Completion time: 2026-10-20T14:29:34Z.
- Target: local desktop plugin, `codex-todo@todo-prototype`.
- Outcome: installed and enabled from the relocated Git repository. The installed files match the committed plugin distribution; the official MCP client initialized the installed server, discovered seven tools and read identical valid v1-v4 HTML resources. Native sidebar acceptance after the required desktop restart remains pending.
- Source boundary: `unknown..368a805433fe200f595161f8c4598522afcf1b71`; the prior 0.2.4 installation was a non-Git artifact, and the newly installed source and generated distribution are captured by this complete Git revision.
- Artifact: version `0.3.0`; installed cache `${CODEX_HOME}/plugins/cache/todo-prototype/codex-todo/0.3.0`.
- SHA-256: `dist/index.html` = `687b79d8e78bbc6c44f8e5e8dd9dc56df114096a3092c67e4f58bc7d397e8e87`; `dist/server.mjs` = `256590f590161e65d3ddd8aa73cd36228b93983edd541e16f2b07cf8a7ca1aaa`.
- Validation: 27 tests pass on the declared minimum Node 22.13.0 runtime, including dependency-free installation from a directory containing spaces and persistence across package replacement. Official portable plugin and MCP schemas pass. Read-only app-server discovery found all three bundled skills enabled without errors. The existing seven project mappings, zero tasks and revision 15 were retained in persistent per-user storage with a private SQLite backup. No model turn or new chat was started.
- Summary: removed machine-specific launch paths and project seeds, separated data from the installation cache, added verified project setup, and prepared an MIT-licensed Git marketplace with runnable bundles, dependency notices, installation documentation and a release archive recipe. No public repository or directory listing was published.

## 9 — Todo marketplace rename

- Completion time: 2026-10-20T14:51:06Z.
- Target: local desktop plugin, `codex-todo@todo`; first recorded installation on this renamed target.
- Outcome: version 0.3.0 installed and enabled under `todo`; the retired `codex-todo@todo-prototype` installation and marketplace registration were removed. Native sidebar acceptance after the documented desktop restart remains pending.
- Source boundary: `unknown..unknown`; the marketplace rename was installed from uncommitted metadata changes based on Git revision `01fb5571faa18c083e8a2e55848f6c315326e720`, so that base hash does not describe the complete installed source. Server and interface bundle bytes are unchanged from installation 8.
- Artifact: version `0.3.0`; installed cache `${CODEX_HOME}/plugins/cache/todo/codex-todo/0.3.0`.
- SHA-256: `dist/index.html` = `687b79d8e78bbc6c44f8e5e8dd9dc56df114096a3092c67e4f58bc7d397e8e87`; `dist/server.mjs` = `256590f590161e65d3ddd8aa73cd36228b93983edd541e16f2b07cf8a7ca1aaa`.
- Validation: 27 tests pass. An official MCP consumer initialized the actual installed package, discovered seven tools, read the valid v4 HTML resource and confirmed seven projects, zero tasks and revision 15 after migration. Read-only app-server discovery found all three skills enabled from the new cache without errors. SQLite and the pre-squash Git history were backed up privately; the README screenshot uses isolated sample data.
- Summary: finalized the `todo` marketplace name and `milancermak` installation examples, added a real UI screenshot to the README, and migrated local state to the new plugin identity. No public repository or directory listing was published.

## 10 — Todo 0.4.0 local installation

- Completion time: 2026-10-20T15:52:03Z.
- Target: local desktop plugin, `codex-todo@todo`.
- Outcome: installed and enabled. The actual cached bundle passed the official MCP client audit, automatically loaded seven Codex projects, and retained the existing task, project identifiers and revision 16. Native visual acceptance after the required desktop restart remains pending.
- Source boundary: `unknown..7b5b256b17fdb1422cd9218f86c0cde00e6dd47e`; the preceding installation on this target used uncommitted marketplace metadata, so its complete source revision is unknown.
- Artifact: version `0.4.0`; installed cache `${CODEX_HOME}/plugins/cache/todo/codex-todo/0.4.0`.
- SHA-256: `dist/index.html` = `4c7dbacabfccafca7e3365bd8a7784b9a58c3188cab1454e7e2ed39605cf5624`; `dist/server.mjs` = `4898d95848b1ea2b4eb448fad95448926f70aca24ff21c990b427de6ed67d8b8`.
- Validation: all 51 tests pass on Node 22.13.0 and Node 24.22.0 LTS. Official portable manifest schemas pass. The installed consumer discovered seven tools and valid identical v1-v5 HTML resources; app-server discovery reported the three enabled todo/today/backlog skills without errors. Browser acceptance covered automatic catalog additions and renames, failure retention and Retry, and compact project-filter spacing. SQLite and Git were backed up privately before installation.
- Summary: automatically discover and reconcile local Codex projects, remove setup, add the backlog capture alias, and keep the project filter label close to its arrow.

## 11 — Todo 0.4.1 local installation

- Completion time: 2026-10-20T16:03:14Z.
- Target: local desktop plugin, `codex-todo@todo`.
- Outcome: installed and enabled. A fresh official MCP consumer verified the actual cached bundle and automatic discovery of seven projects. The existing task, project identifiers, synchronization mappings and revision 16 are unchanged. Native visual acceptance after the required desktop restart remains pending.
- Source boundary: `7b5b256b17fdb1422cd9218f86c0cde00e6dd47e..c5fb2e2f6155845683f51cf0079091aac2ea5ac8`; actual installed revisions were captured before installation and before the ledger-only history amendment.
- Artifact: version `0.4.1`; installed cache `${CODEX_HOME}/plugins/cache/todo/codex-todo/0.4.1`.
- SHA-256: `dist/index.html` = `63861b6f7f92967874b78ee43efeac4cf7acd3527115fb7da12aeb316c2d57c4`; `dist/server.mjs` = `cdbe167feebf8eb80a70d7b49a419b291f81dfe935204581e82504f40987ceca`.
- Validation: all 58 tests pass on Node 22.13.0 and Node 24.22.0 LTS. The installed consumer discovered seven tools and valid identical v1-v6 HTML resources, and skill discovery found todo/today/backlog enabled without errors. Browser checks verify beginning, middle, quoted and multiword tags, clearing partial matches including overlapping names, picker overrides and the actual saved destination, native undo, compact filtering and 320-pixel layout. The README screenshot uses isolated sample tasks. SQLite and the deployed source history were backed up privately.
- Summary: support exact project tags anywhere in an idea while preserving surrounding text and live green highlighting; refresh the README image and tag examples. No public repository or directory listing was published.

## 12 — Todo 0.4.2 local installation

- Completion time: 2026-10-22T16:13:06Z.
- Target: local desktop plugin, `codex-todo@todo`.
- Outcome: installed and enabled. A fresh official MCP consumer initialized the actual installed bundle, discovered seven tools and read all six valid UI resource aliases with exact release HTML. The existing five tasks, four projects, synchronization mappings and metadata, including revision 24, are unchanged. Native visual acceptance after the required desktop restart remains pending.
- Source boundary: `c5fb2e2f6155845683f51cf0079091aac2ea5ac8..318fe41fea7e02fb5a5ed3f78e95f001f0faa75e`; the prior installed artifact was verified against installation 11’s exact server and UI hashes before replacement. The new source revision was captured before installation; the subsequent ledger-only commit is not the installed source.
- Artifact: version `0.4.2`; installed cache `${CODEX_HOME}/plugins/cache/todo/codex-todo/0.4.2`; release archive `codex-todo-plugin-0.4.2.zip`, SHA-256 `5d127449ac8839e290576128db4db47ac45a8b123871d8ce0a7688e57eba03c9`.
- SHA-256: `dist/index.html` = `4d925c5bfcffbdf8233e532ada6d08dc0ea070cc7a9216f3e1b45b9e42c33e65`; `dist/server.mjs` = `46639a63d62e06b375ac02028e3d272ac754cf1e2320b442c9284cd01dba243f`.
- Validation: all 58 tests pass on Node 22.13.0 and Node 24.22.0 LTS. Generated manifests pass the official Agent Plugins 1.0.0 schemas. Codex CLI 0.153.4 reported the new installed version, and app-server skill discovery found todo/today/backlog enabled without errors. The installed-package audit disabled project discovery only in its own process to verify the live database without catalog reconciliation; normal installation settings were not changed. The old package and a consistent SQLite snapshot were backed up privately. Browser acceptance used a separate sample database and covered wrapped labels, concurrent completion, delayed and failed saves, Undo, keyboard focus, reload persistence, reduced-motion branching and final-row transitions without height rebound. Packaging and UI changelog documentation were rechecked on 2026-10-22; existing SDKs and v1-v6 resource contracts are retained.
- Summary: cross out completed tasks with a 2.5-pixel progressive strike capped at 800 ms, collapse rows over 330 ms, hide completed tasks with Undo, and fade empty states into reserved space without a last-row flicker. No remote push or public release was performed.

## 13 — Todo 0.5.0 local installation

- Completion time: 2026-10-23T13:06:08Z.
- Target: local desktop plugin, `codex-todo@todo`.
- Outcome: installed and enabled. A fresh official MCP consumer verified the actual cached bundle, seven tools, all six valid UI resource aliases with exact release HTML, and the new server initialization icon. The existing five tasks, four projects, synchronization mappings and metadata, including revision 24, are unchanged. Native sidebar visual acceptance remains pending the required desktop restart.
- Source boundary: `318fe41fea7e02fb5a5ed3f78e95f001f0faa75e..08a80fa80586112ec96c3d65c3777e6d8a638a17`; the previous installed artifact was verified against installation 12’s exact UI and server hashes. The new source revision was captured before packaging and installation; the following ledger-only commit is not the installed source.
- Artifact: version `0.5.0`; installed cache `${CODEX_HOME}/plugins/cache/todo/codex-todo/0.5.0`; release archive `codex-todo-plugin-0.5.0.zip`, SHA-256 `1a361a2ee08fb85ee3d4a8fc5a11b7f14199ed409243b80f1d535e625cbc11df`.
- SHA-256: `dist/index.html` = `dd6e83a9e542ff7bcfaea24c497a127795cc909c950c4958fb139122bfc1edd2`; `dist/server.mjs` = `977459180485f98d5c1a6c8f86eff76d29f79c0e5becd84805faef296b2666ad`.
- Validation: all 58 tests pass on Node 22.13.0 and Node 24.22.0 LTS. Generated manifests pass the freshly downloaded official Agent Plugins 1.0.0 schemas. Codex CLI 0.153.4 reports version 0.5.0 installed and enabled; app-server discovery finds todo/today/backlog enabled without errors. Every installed package file matches the committed distribution. MCP SDK 1.32.1 and ext-apps 1.7.5 are retained. The audit disabled project synchronization only in its own process; normal installation settings were unchanged. The installed package and a consistent SQLite snapshot were backed up privately before replacement.
- UI evidence: isolated sample-data browser checks covered 1440px light/dark views, 375px layout, input mirroring and exact/partial tags, search/project filtering, completion with Undo and the final-row empty state, pencil editing, inset native dropdown chevrons and the hidden accessible Idea label. Fresh-context finish review found no visual issues. Hallmark’s automated renderer was unavailable; actual browser captures supplied visual evidence, with the user’s no-code-comment rule overriding its CSS stamp requirement.
- Compatibility note: the existing SDK does not expose per-tool icons in its parsed tool list; the new icon was verified on server initialization and in all packaged assets/manifests. Native sidebar icon rendering is not claimed before desktop restart. Current packaging and lifecycle guidance was checked at https://developers.openai.com/plugins/build/plugins and https://learn.chatgpt.com/docs/developer-commands; no dependency, API or resource-version upgrade was made.
- Summary: apply the approved crisp mint redesign with a compact composer, ruled task registers, stronger typography, pencil edit controls and a matching outlined sidebar icon, while preserving capture, project routing and completion behavior.
