# Compatibility

This file describes the current supported contracts and their practical limits. It excludes machine-specific development history. Dependency versions and generated manifests should be checked again when preparing a release.

## Runtime and distribution

| Component | Contract |
| --- | --- |
| Node.js | Latest Node 24 LTS recommended; 22.13 minimum, including the built-in `node:sqlite` module; `node` must be available to the desktop process. |
| MCP SDK | `@modelcontextprotocol/sdk` 1.32.1. |
| MCP Apps SDK | `@modelcontextprotocol/ext-apps` 1.7.5. |
| Validation | Zod 4.6.5, resolved exactly by `package-lock.json`. |
| Plugin | `codex-todo`, with marketplace ID `todo`. |
| Portable release | 0.4.1; runtime, package and generated manifests share the central version. |
| Automatic projects | A compatible local Codex CLI exposing experimental app-server `project/list`; desktop CLI `0.163.0-alpha.10.2` provides the verified contract. |
| Distribution | Committed `plugin/` bundles; no installation-time npm step or fixed source directory. |
| Capture skills | `todo`, `today` and `backlog`; `backlog` is an exact alias of `todo`, including empty invocation. |

SDK versions are deliberate compatibility boundaries, not a claim that they are the newest releases. Check the [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) and [OpenAI extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) before changing an integration. A dependency upgrade is not required merely because a newer major version exists.

The package includes portable `plugin.json` and `mcp.json` alongside `.codex-plugin/plugin.json` and `.mcp.json` compatibility manifests. Both launch the bundled stdio server through `node`. Portable launch paths use `PLUGIN_ROOT`; the compatibility configuration uses its host-specific plugin-root placeholder. These values are supplied by the host, not assigned to a developer's machine path. The catalog source is `./plugin`, relative to the repository root.

Authoritative package formats: [OpenAI packaging](https://developers.openai.com/plugins/build/plugins), [portable plugin schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), and [portable MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json).

## MCP and UI contracts

The server exposes seven model-visible tools: `todo_list`, `todo_add`, `todo_capture`, `todo_update`, `todo_delete`, `todo_project_save` and `todo_project_delete`. Inputs and structured `{ board, projectSync }` results are defined in `src/contracts.mjs`. `todo_list` accepts an optional `refreshProjects` boolean; `true` bypasses the discovery cache for the Retry action. Errors use MCP tool-error results; a failed transactional mutation does not partially save a task.

The SDK negotiates the MCP protocol at initialization. Existing client tests use the v1 SDK's negotiated protocol; they do not establish support for a later protocol revision or an unobserved native host negotiation. When changing protocol requirements, test the real negotiated contract rather than adding fields from an unrelated newer revision.

UI resources use `text/html;profile=mcp-app`. Tool metadata references the registered `ui://` resource through `_meta.ui.resourceUri`. The Todo list tool supplies both global/sidebar and conversation-panel entrypoints through `_meta["openai/ui"].entrypoints`. This is the documented [UI extension contract](https://developers.openai.com/plugins/build/extensions).

The advertised UI URI is defined in `src/server.mjs`. Older published URI aliases remain readable and return the requested URI in their content envelope. The server loads its interface into memory at startup, so removing an old cache directory during an update does not break that process's existing resource reads. An old process can still be unaware of a newly advertised URI; restart the desktop app after updates. Resource identity and cache behavior follow the [MCP App UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui).

The app uses the MCP Apps bridge for tools, host styling and link requests. A native textarea owns input; its presentation-only, aria-hidden backdrop highlights exact unique project tags using text nodes. The host UI renders no remote assets or fonts. The server's optional browser preview listens on loopback and checks host/origin headers.

## Storage and automatic projects

Database precedence is explicit `TODO_DB_PATH`, then `PLUGIN_DATA/todo.sqlite`, then a platform user-data location under `codex-todo`. The macOS fallback directory is `~/Library/Application Support/codex-todo`; Windows uses `%LOCALAPPDATA%/codex-todo` or `~/AppData/Local/codex-todo`; Linux uses `$XDG_DATA_HOME/codex-todo` or `~/.local/share/codex-todo`. Each contains `todo.sqlite`. No database belongs in a versioned plugin cache. A source preview needs an explicit matching path to share a host-specific installed database.

Fresh installations contain no seeded user projects. The first board load discovers Codex's local project catalog automatically. The board polls every seven seconds while visible; server discovery has a 15-second cache, so a catalog change normally appears within about 22 seconds. Capture also refreshes through the same coordinator. Concurrent requests share one discovery attempt. `todo_list({ refreshProjects: true })` forces an immediate retry.

Discovery launches a local `codex app-server` child over standard input and output, initializes with `capabilities.experimentalApi: true`, acknowledges `initialized`, then requests `project/list`. It does not create a chat or turn and does not invoke a model. The initialization lifecycle is described in the [official app-server documentation](https://learn.chatgpt.com/docs/app-server#initialization); the [installed-version protocol source](https://github.com/openai/codex/blob/rust-v0.163.0-alpha.10.2/codex-rs/app-server-protocol/src/protocol/common.rs#L744) marks `project/list` as experimental. This is an app-server contract, separate from the plugin's MCP protocol.

`TODO_CODEX_CLI` selects an explicit executable when needed. Automatic selection prefers a compatible desktop-bundled CLI, then `codex` on PATH. A CLI without `project/list` needs an update or a compatible executable override. `TODO_PROJECT_SYNC=off` disables discovery for isolated development or tests; it is not the default. Discovery covers the local installation's catalog and usable local project roots, not remote or cloud projects. Rootless catalog entries cannot supply a chat folder and are skipped; an existing mapping is retained if its root is temporarily unavailable.

Successful refreshes reconcile discovered names and folders while preserving Todo project IDs and task assignments. Catalog removals remove the corresponding discovered mapping and leave its tasks unassigned. Explicit custom mappings remain separate and survive refresh. A discovered project's name and folder should be maintained in Codex's catalog; there is no project-by-project setup wizard or `setup` skill.

`projectSync` reports `status` (`ready`, `error` or `disabled`), `checkedAt`, `error`, `projectCount` and `unmappedCount`; optional `sourceVersion` identifies the queried CLI. Discovery errors keep the last good project list and every task, expose a nonblocking warning with Retry, and allow unassigned capture. An error is not treated as a successful empty catalog. A source refresh does not inspect project file contents or alter Codex's project database.

The manual `todo_project_save` tool remains available for an explicitly requested custom folder outside the catalog. It verifies an existing absolute directory and reuses one mapping per path. `todo_project_delete` leaves tasks unassigned and does not remove local files. Neither tool replaces automatic discovery.

Capture uses one idea field. Exact full project tags resolve automatically at the beginning, middle or end of an idea; uncertain matches require an explicit selection and are rejected before writes. The UI's effective destination and project are parsed from the same state sent to the server. Picker choices rewrite conflicting directives. Legacy Inbox tasks appear in Backlog; completed tasks remain in their prior section. Legacy notes are merged into the editable idea without discarding text.

## Chat handoff and verification limits

Chat drafting uses the documented `codex://threads/new` link with URI-encoded `prompt` and optional absolute `path`. The user sends the prompt. Host link refusal keeps a copyable fallback. This follows the [desktop commands reference](https://learn.chatgpt.com/docs/reference/commands#deep-links); no private app bridge or undocumented project-ID link parameter is required.

Automated coverage includes capture parsing and directive changes, input/output schemas, CRUD rollback, persistence, completion restoration, project removal, UI resource aliases and operation after an installed directory is removed. Release checks should consume the generated package through an official MCP SDK client rather than testing source helpers alone.

Desktop macOS opening and browser editing have been exercised during development, including 320-pixel layout, exact-to-partial highlighting, undo, selection and scroll synchronization. These observations are separate from a clean installation test of a newly packaged release. Windows/Linux native UI behavior, physical IME input and the final project placement of a native launched chat require their own acceptance checks. Passing an HTTP response or standalone SDK test does not prove those journeys.

## Verification

The 0.3.0 packaging baseline was verified on 2026-10-20 using macOS arm64, Node 22.13.0 and Node 26.8.2. A fresh official SDK consumer negotiated MCP `2025-11-25`, initialized Todo 0.3.0, discovered seven tools and read the v4 HTML resource without protocol errors. The portable manifest and MCP configuration pass the official Agent Plugins 1.0.0 JSON schemas. Bundled CLI `0.163.0-alpha.10.2` provides the documented marketplace and installation commands.

The package consumer test starts the committed-style bundle from an isolated directory containing spaces, without node_modules or a database override. With discovery disabled for isolation, it verifies an empty board, an explicit custom folder, capture and persistence after replacing the installation directory while retaining external `PLUGIN_DATA`. Storage tests exercise macOS, Windows and Linux path rules; only macOS native runtime was exercised.

All 12 dependencies included by the server and interface bundles are covered by `THIRD_PARTY_NOTICES.md`. The generated package contains only Node built-in external imports and no personal project seeds, database or developer checkout paths.

The [plugin UI changelog](https://developers.openai.com/plugins/changelog) and packaging contracts were checked for the 0.3.0 baseline. Existing SDK versions were retained. Version 0.4.0 adds the experimental local project-catalog consumer and reconciliation without upgrading the UI or MCP SDK. All 51 tests pass on Node 22.13.0 and Node 24.22.0 LTS, including first load, rename and path changes, removals, cache expiry, explicit Retry, disabled discovery, unsupported CLI and failed or malformed responses that retain the last good list. A fresh bundled SDK consumer discovered seven projects through the actual desktop CLI without a manual project save or executable override, exercised tagged Today and Backlog capture in disposable storage, and read the v5 interface. Browser acceptance with an isolated catalog verified first-load discovery, automatic rename and addition, preservation during a discovery failure, successful Retry without a board revision change, and compact text-and-arrow filtering. Native sidebar reload after installation still requires the documented desktop restart and a user acceptance check.

Version 0.4.1 supports exact project tags at any position, including quoted or unquoted multiword names, while preserving surrounding idea text. All 58 tests pass on Node 22.13.0 and Node 24.22.0 LTS; the official MCP consumer exercises beginning and middle tags through the complete save contract. Browser acceptance verifies live routing and green highlighting, exact-to-partial clearing including overlapping names, explicit picker changes and saved destination, native undo, and a 320-pixel layout without overflow. The README screenshot was recaptured from this interface with disposable sample data. UI resource v6 is advertised; aliases v1-v5 remain readable.

The marketplace was renamed from `todo-prototype` to `todo` before public publication. Host-managed plugin data is keyed by marketplace and plugin identity, so an existing development install needs its SQLite database migrated when changing that identity. This migration is local maintenance; the distributed package contains no legacy user data or bundled migration of development databases. Historical installation records retain the identifiers actually used at the time.
