# Appium Interactive

Persistent Android UI inspection and interaction for OpenCode V2 through Appium and WebdriverIO.

`appium-interactive` keeps the WebdriverIO client, Appium driver, collected state, and helper functions alive across turns by running inside the persistent Node.js Cell from [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools).

Use it for Android QA, accessibility-driven element discovery, forms, navigation, scrolling, screenshots, and virtualized lists.

## What it gives you

- A persistent Appium session instead of reconnecting for every action
- Semantic element discovery through Android accessibility and resource metadata
- Step-by-step inspect → interact → verify workflows
- W3C touch gestures for scrolling and virtualized lists
- In-memory screenshots returned directly to OpenCode
- Reusable state and helper functions across the same OpenCode session

The detailed execution rules live in [SKILL.md](./SKILL.md).

## Requirements

- Linux
- OpenCode V2
- [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools)
- Node.js 26 or newer
- Appium available as `appium`
- Appium UiAutomator2 driver installed
- Android SDK and Java configured for UiAutomator2
- A running Android device or emulator visible to ADB
- `webdriverio` resolvable from the active OpenCode project

Before creating a session, know the target device identity, Android package name, and launch activity.

The skill does not install or upgrade Appium, UiAutomator2, Android tooling, or WebdriverIO during a UI task.

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

Install this skill at `$HOME/.config/opencode/skills/appium-interactive`:

```sh
d="$HOME/.config/opencode/skills/appium-interactive"; mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:appium-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

The installed skill entrypoint is:

```text
$HOME/.config/opencode/skills/appium-interactive/SKILL.md
```

## Quick start

Ask OpenCode for the Android task directly or name the skill explicitly:

```text
Use appium-interactive to inspect the login screen on my Android emulator.
Use appium-interactive to fill this form and verify the submitted state.
Use appium-interactive to scroll through these results and collect the visible item names.
```

The skill uses the direct OpenCode tools `repl_node`, `repl_job`, and `repl_reset`. The persistent Node Cell keeps the Appium driver and working state available between interactions.

## How it works

The default Appium endpoint is `http://127.0.0.1:4723`. The skill checks `/status` first and reuses a healthy server when one is already running. If no usable server is available, it starts Appium and waits for the endpoint to become ready before opening a WebdriverIO session.

Once connected, the workflow verifies the current package, activity, and fresh Android page source before interacting. It prefers accessibility IDs, stable resource IDs, and other semantic selectors over coordinates.

After navigation or scrolling, the current UI is inspected again and elements are reacquired instead of assuming old handles still point to the visible view. Virtualized lists are collected with bounded scrolling and stable-item deduplication.

Screenshots stay in memory and are emitted directly through `opencode.emitImage(...)`; temporary screenshot files are not required for normal inspection.

## Persistence and reset

The Appium client, driver, collected sets, and helper functions survive across `repl_node` calls while the Node Cell remains alive.

Long-running evaluations can continue as jobs and be inspected through `repl_job`. A hard interpreter retirement or `repl_reset({ language: 'node' })` destroys the in-process WebdriverIO binding, so the driver session must be recreated before continuing.

Cancellation is not rollback. Taps, text input, navigation, network requests, and other actions already sent to the device may remain in effect.

## Verification

A successful WebDriver command is not enough to prove the requested UI state. The skill verifies consequential actions against fresh page source, package/activity state, accessible text or attributes, and screenshots when visual confirmation matters.

See [SKILL.md](./SKILL.md) for the selector order, session setup, scrolling procedure, readiness checks, and complete verification contract.

## Security

`opencode-repl-tools` executes trusted local code with the permissions of the OpenCode process. It is not a sandbox.

Use this skill only with devices, emulators, applications, and Appium endpoints the user is authorized to control.

## Update

Replace the installed subtree with the current version:

```sh
d="$HOME/.config/opencode/skills/appium-interactive"; rm -rf "$d" && mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:appium-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

Update the REPL backend separately with OpenCode's plugin commands.

## Remove

```sh
rm -rf "$HOME/.config/opencode/skills/appium-interactive"
```

Removing the skill does not remove `opencode-repl-tools`.
