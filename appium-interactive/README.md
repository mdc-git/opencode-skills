# Appium Interactive

`appium-interactive` is an OpenCode V2 skill for persistent Android UI inspection and interaction through Appium and WebdriverIO. It runs inside the session's persistent Node.js Cell provided by [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools), so the Appium client, driver session, collected state, and helper functions remain available across turns.

Use it for Android app QA, accessibility-driven element discovery, forms, navigation, scrolling, screenshots, and virtualized lists.

See [SKILL.md](./SKILL.md) for the full execution contract.

## Requirements

- Linux.
- OpenCode V2.
- [OpenCode REPL Tools](https://github.com/mdc-git/opencode-repl-tools).
- Node.js 26 or newer for `repl_node`.
- Appium available as `appium`.
- Appium UiAutomator2 driver installed.
- Android SDK and Java environment configured for UiAutomator2.
- A running Android device or emulator visible to ADB.
- `webdriverio` resolvable from the active OpenCode project.

The target app package, launch activity, and device identity must be known before creating a session.

## Install

Install the REPL backend as a global OpenCode package plugin:

```sh
opencode2 plugin add github:mdc-git/opencode-repl-tools
```

Install the skill directly at `$HOME/.config/opencode/skills/appium-interactive`:

```sh
d="$HOME/.config/opencode/skills/appium-interactive"; mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:appium-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

The installed entrypoint is:

```text
$HOME/.config/opencode/skills/appium-interactive/SKILL.md
```

## Use

Ask OpenCode for the Android task directly or name the skill explicitly:

```text
Use appium-interactive to inspect the login screen on my Android emulator
Use appium-interactive to fill this form and verify the result
Use appium-interactive to scroll through the results and collect the visible item names
```

The skill uses `repl_node`, `repl_job`, and `repl_reset` as direct OpenCode tools. They are not invoked through Code Mode or wrapped in `execute`.

The persistent Node Cell keeps the Appium endpoint configuration, WebdriverIO client, `driver` session, collected sets, and helper functions alive between interactions.

## Appium Server

The default endpoint is:

```text
http://127.0.0.1:4723
```

The skill probes `/status` before starting Appium. A healthy existing server is reused. If no healthy server is available, the skill starts Appium and waits for the status endpoint to become ready before creating a WebdriverIO session.

An occupied port is not treated as proof that Appium is unusable; endpoint health determines whether the existing process can be reused.

## Android Session

WebdriverIO is loaded from the active project:

```js
var { remote } = require('webdriverio')
```

The session uses UiAutomator2 capabilities such as the device name, app package, app activity, `noReset`, and command timeout. Immediately after connecting, the skill verifies the session ID, current package, current activity, and page source before interacting.

## Inspection and Selection

The skill reads fresh Android page source whenever the screen may have changed and prefers semantic selectors over coordinates.

Typical selector priority is:

1. accessibility ID from `content-desc`;
2. stable Android resource ID or UiSelector;
3. UiSelector by stable text or description;
4. short, specific XPath when the other forms cannot express the target.

Element handles are reacquired after navigation and repeated scrolling when Android may have recreated the native view.

## Forms and Navigation

Editable Android controls are handled through normal WebdriverIO element commands such as `clearValue()` and `setValue()`. After input, the skill waits for the expected UI state before continuing.

Navigation commands such as app activation, deep links, and `driver.back()` are treated as requests to change state, not proof that the target screen is ready. The skill re-reads page source and verifies semantic markers before the next interaction.

## Scrolling and Virtualized Lists

Low-level swipe gestures use W3C pointer actions through `performActions()` and `releaseActions()`. Coordinates are derived from the current window size rather than from a fixed device resolution.

For virtualized lists, the skill reads fresh page source before and after each gesture, stores stable item identities in a `Set`, and stops after a bounded number of gestures or when no new relevant identities appear. It does not retain element handles across scrolls.

## Screenshots

Android screenshots are returned directly from memory:

```js
var screenshot = Buffer.from(await driver.takeScreenshot(), 'base64')
await opencode.emitImage({
  bytes: screenshot,
  mimeType: 'image/png'
})
```

No temporary screenshot file is required when the image is only needed by the agent.

## Runtime Behavior

| Property | Behavior |
| --- | --- |
| REPL backend | Persistent Node.js/TypeScript Cell from `opencode-repl-tools` |
| Appium client | WebdriverIO resolved from the active project |
| Android driver | Appium UiAutomator2 |
| Default Appium endpoint | `http://127.0.0.1:4723` |
| Server reuse | Healthy existing `/status` endpoint is reused |
| Foreground window | 5 seconds per accepted REPL evaluation |
| Background work | Continues under a retained job ID and can be inspected with `repl_job` |
| Cancellation | Cooperative interruption first; an evaluation still active after 2 seconds can hard-retire the interpreter |
| Job retention | 20 most recent terminal jobs per language Cell |
| Screenshots | In-memory PNG output through `opencode.emitImage(...)` |
| Persistent state | Driver, collected data, and helpers remain available across REPL calls while the Cell stays alive |

A hard interpreter retirement or `repl_reset({ language: 'node' })` loses the in-process WebdriverIO binding. Recreate the client and driver session before continuing.

Cancellation is not rollback. Taps, text input, navigation, network requests, and other actions already sent to the device may remain in effect.

## Verification

Before reporting a result, verify the active session, expected package when relevant, fresh page-source markers, and the visible or semantic result of each consequential interaction.

For scrolling collection, deduplicate stable identities and verify the bounded stopping condition before treating the result set as complete.

A successful WebDriver command alone is not UI verification.

## Security

`opencode-repl-tools` executes trusted local code and is not a sandbox. Code in `repl_node` runs with the current user's Node.js permissions and can access local processes, the filesystem, network, Android tooling, and the connected Appium endpoint.

Use the skill only with devices, emulators, applications, and Appium endpoints the user is authorized to control.

## Update

Run the install command again to replace the installed skill with the current `appium-interactive` subtree:

```sh
d="$HOME/.config/opencode/skills/appium-interactive"; rm -rf "$d" && mkdir -p "$d" && git -C "$d" init -q && git -C "$d" fetch -q --depth=1 --filter=blob:none https://github.com/mdc-git/opencode-skills.git master && git -C "$d" read-tree FETCH_HEAD:appium-interactive && git -C "$d" checkout-index -af && rm -rf "$d/.git"
```

Use OpenCode's plugin commands to inspect and update the REPL backend separately:

```sh
opencode2 plugin check
opencode2 plugin update
```

## Remove

Remove the installed skill directory:

```sh
rm -rf "$HOME/.config/opencode/skills/appium-interactive"
```

`opencode-repl-tools` is a separate plugin and can remain installed for other persistent REPL workflows.
