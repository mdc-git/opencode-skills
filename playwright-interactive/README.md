# Playwright Interactive

Persistent browser and Electron QA for OpenCode V2 through Playwright.

`playwright-interactive` runs Playwright inside the persistent Node.js Cell from [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools), so browser pages, contexts, locators, modules, and helper functions remain available across turns.

Use it for local web apps, authorized remote websites, responsive checks, multi-step browser flows, screenshots, and Electron applications.

<!-- markdownlint-disable-next-line MD033 -->
<video controls src="https://github.com/user-attachments/assets/b015fe51-692f-475b-a8ac-a772695db35e"></video>

## What it gives you

- Persistent browser state across OpenCode turns
- Page observation through compact AI accessibility snapshots whose element refs are directly actionable
- Normal Playwright locators, navigation, assertions, frames, tabs, and screenshots
- Chromium for local web applications
- Camoufox through Playwright's Firefox APIs for authorized remote websites
- Playwright's Electron launcher for desktop application QA
- Optional persistent browser profiles when the user explicitly supplies one
- In-memory screenshots returned directly to OpenCode

The detailed execution contract lives in [SKILL.md](./SKILL.md).

## Requirements

- Linux
- OpenCode V2
- [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools)
- Node.js 26 or newer
- `bun` and `flock` available on `PATH`

The skill currently pins Playwright `1.62.1` and Camoufox `0.13.0`. Its setup script installs the matching browser runtimes into:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/opencode/playwright
```

Projects do not need their own Playwright dependency for this workflow.

## Install

Add the REPL backend to your OpenCode configuration:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-repl-tools@git+https://github.com/mdc-git/opencode-repl-tools.git"
    }
  ]
}
```

Install this skill at `$HOME/.config/opencode/skills/playwright-interactive`:

```sh
d="$HOME/.config/opencode/skills/playwright-interactive"; mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:playwright-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

The installed skill entrypoint is:

```text
$HOME/.config/opencode/skills/playwright-interactive/SKILL.md
```

## Quick start

Ask OpenCode for the browser task directly or name the skill explicitly:

```text
Use playwright-interactive to inspect http://localhost:3000 and check the dashboard layout.
Use playwright-interactive to test this staging signup flow and verify the confirmation state.
Use playwright-interactive to launch the Electron app and verify the settings dialog.
```

The skill uses the direct OpenCode tools `repl_node`, `repl_job`, and `repl_reset`. The persistent Node Cell keeps browser handles and working state available between interactions.

## Browser modes

The skill selects one startup mode for the task:

| Target | Runtime |
| --- | --- |
| Local web application | Playwright Chromium |
| Authorized remote website | Camoufox through Playwright Firefox APIs |
| Electron application | Playwright Electron launcher |

Local web and Electron tasks use normal Playwright interaction. Remote web tasks add humanized input while Playwright remains responsible for browser lifecycle, navigation, locators, frames, tabs, screenshots, waiting, and assertions.

Humanized `fill` and `type` click the field before replacing or appending text. Off-screen targets are reached with wheel input where possible, including inside scroll containers. Frame targets and scrolling that cannot make progress use a programmatic fallback.

Browser sessions stay open after a task so the visible result can be inspected and later turns can continue from the same state.

## Inspection and interaction

The workflow inspects the current UI before acting, performs consequential interactions incrementally, and verifies the resulting state before continuing.

The agent works from Playwright's AI accessibility snapshot rather than HTML or screenshots. It outlines a page at low depth, narrows to the relevant region or searches the stored tree with the bundled `ariaFind` helper, acts on the snapshot's element refs, and verifies the result with a scoped re-snapshot or locator state. Covered controls are found by hit-testing rather than screenshots, so cookie banners and modals are detected and dismissed through their own snapshot refs. The snapshot is treated as a semantic view rather than a picture, so element screenshots, viewport screenshots and targeted DOM inspection remain escalation steps for overlays, canvas, weak semantics and visual tasks.

Playwright handles frames, open shadow roots, popups, tabs, navigation, screenshots, and assertions directly. Detailed snapshot, ref, popup, overlay, and remote-input rules are kept in [SKILL.md](./SKILL.md).

## Bundled scripts

| Script | Provides |
| --- | --- |
| `scripts/browser-session.mjs` | `ensureRuntime()`, `openLocal()`, `openRemote()`, `openElectron()`, `openTab()` for Camoufox tabs, and `followAction()` to report whether an action navigated or opened a page |
| `scripts/observation.mjs` | `observe()` for location, tabs, frames, overlays and a snapshot outline in one call; `findOverlays()` to report which elements cover visible controls; `ariaFind()` to search a stored snapshot; `settle()` to wait until the document stops changing |
| `scripts/humanized-input.mjs` | Humanized pointer, keyboard and form input for remote web; a covered target's error names the covering element |
| `scripts/install-playwright.mjs` | Installs or verifies the pinned Playwright and Camoufox runtime with Bun |

## Screenshots

When a task needs visual evidence, screenshots are returned directly from memory:

```js
await opencode.emitImage({
  bytes: await page.screenshot({ type: 'png' }),
  mimeType: 'image/png'
})
```

No temporary screenshot file is required for normal visual inspection.

## Persistent profiles

Persistent profiles are opt-in. The skill uses one only when the user explicitly asks to reuse a profile and supplies its exact directory.

A profile can contain credentials, cookies, and browsing history. The skill does not inspect or expose that data unless the task requires it, and it does not delete browser lock files to force-open a profile already in use.

## Persistence and reset

Browser, context, page, locator, module, and helper handles survive across `repl_node` calls while the Node Cell remains alive.

Long-running evaluations can continue as jobs and be inspected through `repl_job`. If the Node Cell is reset or hard-retired, its in-process browser handles are lost; runtime setup and browser startup must then be run again.

Cancellation is not rollback. Browser actions, requests, navigation, and filesystem writes that already happened may remain in effect.

## Security

`opencode-repl-tools` executes trusted local code with the permissions of the OpenCode process. It is not a sandbox.

Remote browsing should only be used where the user is authorized to access and interact with the target. Site access controls, policies, and rate limits still apply.

## Update

Replace the installed subtree with the current version:

```sh
d="$HOME/.config/opencode/skills/playwright-interactive"; rm -rf "$d" && mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:playwright-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

Update the REPL backend separately with OpenCode's plugin commands.

## Remove

```sh
rm -rf "$HOME/.config/opencode/skills/playwright-interactive"
```

Removing the skill does not remove `opencode-repl-tools`.
