# Playwright Interactive

`playwright-interactive` is an OpenCode V2 skill for persistent browser and Electron QA with Playwright. It runs Playwright inside the persistent Node.js Cell provided by [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools), so pages, browser contexts, locators, helper functions, and other JavaScript objects remain available across turns.

The skill is designed for work that benefits from an actual programmable browser session rather than a fixed menu of browser actions. The agent can inspect the current UI, perform one interaction at a time, verify the result, and keep useful handles alive while the task continues.

<!-- markdownlint-disable-next-line MD033 -->

<video controls src="https://github.com/user-attachments/assets/b015fe51-692f-475b-a8ac-a772695db35e"></video>

See [SKILL.md](./SKILL.md) for the full execution contract.

## What it supports

Local web applications run in standard Chromium. Authorized remote websites run through Camoufox using Playwright's Firefox APIs and the bundled humanized-input helpers. Electron applications use Playwright's Electron launcher.

The same persistent REPL session is used throughout the task. This makes it practical to debug a local application while its source changes, work through a multi-step browser flow, inspect popups and frames, or keep an Electron window open while testing successive changes.

Screenshots are returned directly from memory. The skill calls Playwright's `page.screenshot()` without a file path and passes the resulting bytes to `opencode.emitImage(...)`, which is provided by `opencode-repl-tools`.

## Example workflows

### Verify a staging signup flow

Ask OpenCode to open the staging site, complete the form with test data, follow the visible confirmation path, inspect the resulting dashboard or error state, and report interaction or layout problems with screenshots.

### Debug a local application

The skill can open a local development server, keep the page and useful locators alive, and inspect the rendered result after source changes. Later turns continue from the same browser state instead of recreating the session for every check.

### Inspect an Electron application

The skill can launch an Electron application, inspect its windows, interact with visible controls, and verify the result after code changes. Electron uses Playwright's Electron launcher and normal Playwright input.

### Research a live website

For an authorized remote site, the skill can inspect JavaScript-rendered content, visible controls, frames, open shadow roots, popups, and additional tabs. Remote interaction uses Camoufox plus the bundled humanized input layer while Playwright remains responsible for browser lifecycle, navigation, locators, screenshots, waiting, and assertions.

## Requirements

- Linux.
- OpenCode V2.
- [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools).
- Node.js 26 or newer for `repl_node`.
- `npm`, `npx`, and `flock` available on `PATH`.

The skill pins Playwright `1.60.0` and Camoufox `0.12.0`. Its setup script installs the matching Chromium build and Camoufox runtime into a shared cache when required.

The default cache is:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/opencode/playwright
```

Projects do not need their own Playwright dependency for this workflow.

## Install

Install the REPL backend as a global OpenCode package plugin:

```sh
opencode2 plugin add github:mdc-git/opencode-repl-tools
```

Install the skill directly at `$HOME/.config/opencode/skills/playwright-interactive`:

```sh
d="$HOME/.config/opencode/skills/playwright-interactive"; mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:playwright-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

The installed entrypoint is:

```text
$HOME/.config/opencode/skills/playwright-interactive/SKILL.md
```

## Use

Ask OpenCode for the browser task directly or name the skill explicitly. For example:

```text
Use playwright-interactive to open https://www.google.com
Use playwright-interactive to inspect http://localhost:3000 and check the dashboard layout
Use playwright-interactive to launch the Electron app and verify the settings dialog
```

The skill uses `repl_node`, `repl_job`, and `repl_reset` as direct OpenCode tools. `repl_node` evaluates the browser code in the persistent Node Cell, `repl_job` manages work that remains active, and `repl_reset` discards the Node Cell when a clean interpreter is required.

The generic REPL lifecycle, job, cancellation, retention, and output contracts are owned by `opencode-repl-tools`. The Playwright skill only relies on those public tools and `opencode.emitImage(...)`.

## Browser startup

The skill prepares its shared browser runtime before launching a browser. `scripts/install-playwright.mjs` verifies the pinned Playwright and Camoufox packages, Chromium executable, Camoufox runtime, and bundled humanized-input helpers. Concurrent setup is serialized with `flock`.

Local URLs use Chromium. Remote URLs use Camoufox with a Playwright Firefox context. Electron tasks use Playwright's Electron launcher. Web contexts use `viewport: null` so the Playwright viewport follows the visible browser window.

Remote browsing starts with one page. Additional Camoufox pages are opened through browser-originated `window.open()` or observed popup events so they appear as tabs in the same visible browser window.

## Inspection and interaction

The skill prefers Playwright's user-facing locators such as `getByRole()` and `getByLabel()`. When the next target is not already known, it first uses Playwright's AI-oriented ARIA snapshot when that API is available. The snapshot provides roles, accessible names, element references, nested iframe information, and optional element bounds in one representation.

Remote workflows inspect the visible page before starting the requested interaction. Cookie consent, unrelated promotional overlays, surveys, chat invitations, and similar interruptions are handled before the task continues when they can be dismissed safely. Dialogs related to authentication, permissions, destructive actions, validation, submission, checkout, or other consequential decisions are inspected rather than dismissed automatically.

The skill proves interactive flows incrementally. It inspects the current state, performs one interaction, and verifies the resulting state before consolidating proven steps into larger automation.

## Screenshots

Screenshots are emitted directly from the persistent Node Cell:

```js
await opencode.emitImage({
  bytes: await page.screenshot({ type: 'png' }),
  mimeType: 'image/png'
})
```

The image transport and validation contract is provided by `opencode-repl-tools`.

## Persistent profiles

Browser profiles are opt-in. A persistent profile is used only when the user explicitly asks to reuse one and supplies its exact directory. Otherwise local and remote browser sessions use their normal non-persistent context flow.

A persistent profile may contain credentials, cookies, and browsing history. Profile data should not be inspected or exposed unless the task requires it. A profile directory must not be modified by deleting lock files while another browser owns it.

## Runtime behavior

| Property | Behavior |
| --- | --- |
| REPL backend | Persistent Node.js/TypeScript Cell from `opencode-repl-tools` |
| Browser state | Browser, context, page, locator, module, and helper handles persist across REPL calls |
| Local web | Standard Playwright Chromium |
| Remote web | Camoufox through Playwright Firefox APIs |
| Electron | Playwright Electron launcher |
| Playwright version | `1.60.0` |
| Camoufox version | `0.12.0` |
| Browser cache | `${XDG_CACHE_HOME:-$HOME/.cache}/opencode/playwright` |
| Screenshots | In-memory image output through `opencode.emitImage(...)` |
| Profiles | Ephemeral by default; persistent only when explicitly requested with an exact directory |

If the Node Cell loses its in-process browser bindings, the skill runs the runtime setup and complete browser startup again before continuing browser work. Browser actions, requests, navigation, and filesystem writes are not transactional, so the observed browser state is inspected before replaying a consequential action.

Interactive browser sessions stay open after a task so the visible result can be inspected and later turns can continue from the same state.

## Security

`repl_node` executes trusted local code with the permissions of the OpenCode process. See `opencode-repl-tools` for the REPL security and isolation contract.

Remote browsing should be used only where the user is authorized to access and interact with the target. Site access controls, policies, and rate limits still apply.

## Update

Run the install command again to replace the installed skill with the current `playwright-interactive` subtree:

```sh
d="$HOME/.config/opencode/skills/playwright-interactive"; rm -rf "$d" && mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:playwright-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

Use OpenCode's plugin commands to inspect and update the REPL backend separately:

```sh
opencode2 plugin check
opencode2 plugin update
```

## Remove

Remove the installed skill directory:

```sh
rm -rf "$HOME/.config/opencode/skills/playwright-interactive"
```

`opencode-repl-tools` is a separate plugin and can remain installed for other persistent REPL workflows.
