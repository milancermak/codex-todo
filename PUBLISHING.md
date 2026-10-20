# Distributing Codex Todo

The repository is prepared for installation through a Git-backed custom marketplace. Repository distribution, workspace publication and listing in OpenAI's universal directory are separate routes. No GitHub repository or public directory publication is implied by the files in this checkout.

## GitHub marketplace

Use `codex-todo` as the plugin identifier and `todo` as the marketplace identifier. The catalog at `.agents/plugins/marketplace.json` points to the committed `./plugin` directory. After publishing the repository as `milancermak/codex-todo-plugin`, users can install it with:

```sh
codex plugin marketplace add milancermak/codex-todo-plugin
codex plugin add codex-todo@todo
```

GitHub shorthand and Git URLs are supported marketplace sources. See the current [plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) before changing the catalog format or installation workflow.

Before a release:

- Update the central runtime version and package metadata together, then run `npm ci`, `npm run build` and `npm test`.
- Commit the regenerated `plugin/` distribution, both manifest formats, the marketplace catalog, all three capture skills, the MIT license and dependency notices.
- Confirm the tracked package contains no live database, personal project seeds, credentials, local executable paths or developer-specific configuration.
- Test a clean install with Node 22.13 or newer, automatic discovery from a compatible Codex local project catalog, capture, persistence, update/restart and native chat-draft opening. Verify discovery failure retains the last good list and that a manual refresh reports the failure instead of requesting every project by hand.
- After installation, run `npm run verify:skills` to check discovery of `todo`, `today` and `backlog`. Set `TODO_CODEX_CLI` when the intended host's CLI differs from `codex` on PATH.
- Verify the intended GitHub repository is `milancermak/codex-todo-plugin`. Creating a remote or publishing the repository is a separate maintainer action.

The installed package must run from its own bundled files without npm, a source checkout or a fixed home directory. Automatic project discovery additionally needs a compatible local Codex CLI exposing the experimental `project/list` app-server method. Test against the intended desktop CLI and an unsupported CLI; never substitute an unverified direct read of Codex's internal database. See [COMPATIBILITY.md](COMPATIBILITY.md) for the verified contract and discovery scope. SQLite belongs in per-user storage, with `TODO_DB_PATH` available as an explicit override. Keep private databases, personal screenshots and machine-specific development history outside version control. The README screenshot should use sample tasks without personal information. The tracked deployment ledger retains sanitized installation records.

Commit the reviewed release tree, then run `npm run package`. The script requires a Git commit and a clean tracked tree; it uses `git archive` to produce `releases/codex-todo-plugin-0.4.1.zip` for version 0.4.1, with `releases/SHA256SUMS`. The archive includes source and the committed runnable `plugin/` bundle. Packaging creates local deliverables; it does not create a GitHub release, push a remote or submit a directory listing. The MIT license and generated `THIRD_PARTY_NOTICES.md` are included in both the repository and plugin distribution.

After an update, restart the desktop app before native acceptance. Installing the new bytes and checking them with a fresh SDK client does not prove that an existing sidebar connection has reloaded them.

## OpenAI directory

A custom Git marketplace does not make the plugin an approved public directory listing. As checked on 2026-10-20, OpenAI limits local MCP submissions to approved partners with an allowlisted submitting organization. Verify eligibility before starting that route. See [desktop-only submissions](https://developers.openai.com/plugins/deploy/desktop-only).

A future directory submission also needs the publisher identity, listing information, support and policy pages, test scenarios and other current review materials required by [OpenAI's submission process](https://developers.openai.com/plugins/deploy/submission). The public privacy description must distinguish local database storage from task text or project mappings supplied to Codex through tools and chat prompts.

The project's MIT license grants rights in this repository; it does not replace host requirements, directory review or dependency license obligations.
