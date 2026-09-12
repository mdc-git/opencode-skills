# OpenCode Skills

Reusable OpenCode skills for interactive browser, Electron, and Android QA.

## Skills

### `playwright-interactive`

Persistent Playwright browser and Electron QA through `repl_node`, including local applications, authorized remote websites, screenshots, responsive checks, and retained browser state across turns.

### `appium-interactive`

Persistent Android application inspection and interaction through Appium and WebdriverIO in `repl_node`, including accessibility-driven discovery, forms, navigation, scrolling, screenshots, and virtualized lists.

## Requirements

Both skills expect the persistent Node REPL tools provided by `opencode-repl-tools`:

- `repl_node`
- `repl_job`
- `repl_reset`

Additional browser or Android requirements are documented in each skill's `SKILL.md`.

## Use

Install or copy the skill directory you need into an OpenCode skill location, then let OpenCode load its `SKILL.md`.

Each skill is self-contained. Read its `SKILL.md` for runtime setup, safety gates, and the workflow to follow during a task.
