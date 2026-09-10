---
name: appium-interactive
description: Persistent Android app inspection and interaction through Appium and WebdriverIO in repl_node. Use for Android UI QA, accessibility-driven element discovery, forms, navigation, scrolling, screenshots, and virtualized lists.
---

# Appium Interactive

Use Appium and WebdriverIO from the persistent Node.js Cell provided by `opencode-repl-tools` to inspect and drive Android applications interactively.

## REQUIRED: REPL Tools

`repl_node`, `repl_job`, and `repl_reset` are direct OpenCode tools.

Invoke them directly through the tool interface. Do not discover, wrap, or invoke them through `execute` or Code Mode.

Pass JavaScript or TypeScript source directly in the `code` argument of `repl_node`. The same Node Cell persists across calls, so the Appium client, driver session, collected state, and helper functions remain available between interactions.

Use `repl_job` when an evaluation continues beyond the foreground window. Use `repl_reset` only when losing the Node Cell's Appium bindings and retained state is acceptable.

## Preconditions

Before starting an Android session, confirm:

- Appium is installed and available as `appium`.
- The Appium UiAutomator2 driver is installed.
- The Android SDK and Java environment required by UiAutomator2 are configured.
- The target device or emulator is running and visible to ADB.
- `webdriverio` is resolvable from the active OpenCode project.
- The target app package, launch activity, and device identity are known.

Do not install or upgrade these dependencies implicitly during a UI task.

## Start or Reuse Appium

Use `127.0.0.1:4723` unless the task specifies another Appium endpoint. Probe `/status` before starting a server. Reuse a healthy endpoint instead of starting another process on the same port.

```js
var { spawn } = require('node:child_process')
var APPIUM_HOST = '127.0.0.1'
var APPIUM_PORT = 4723
var APPIUM_URL = `http://${APPIUM_HOST}:${APPIUM_PORT}`

var probeAppium = async () => {
  try {
    var response = await fetch(`${APPIUM_URL}/status`, {
      signal: AbortSignal.timeout(1000)
    })
    return response.ok ? await response.json() : undefined
  } catch {
    return undefined
  }
}

var appiumStatus = await probeAppium()
if (!appiumStatus) {
  globalThis.appiumProcess = spawn(
    'appium',
    ['--address', APPIUM_HOST, '--port', String(APPIUM_PORT)],
    { stdio: 'ignore' }
  )

  var appiumSpawnError
  globalThis.appiumProcess.once('error', (error) => {
    appiumSpawnError = error
  })

  var appiumDeadline = Date.now() + 15000
  while (!appiumStatus && Date.now() < appiumDeadline) {
    if (appiumSpawnError) throw appiumSpawnError
    if (globalThis.appiumProcess.exitCode !== null) {
      throw new Error(`Appium exited with code ${globalThis.appiumProcess.exitCode}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    appiumStatus = await probeAppium()
  }

  if (!appiumStatus) {
    throw new Error(`Appium did not become ready at ${APPIUM_URL}`)
  }
}

;({ status: 'Appium ready', url: APPIUM_URL })
```

If this cell becomes a background job, use `repl_job` with `status` until it reaches a terminal state before creating a driver session.

An occupied port is not proof that Appium is unusable. The `/status` probe determines whether the existing endpoint is a usable Appium server.

## Create the Android Session

Load WebdriverIO from the active project. Do not use a fixed install-relative path.

```js
var { remote } = require('webdriverio')
```

Create the session with task-specific values:

```js
var DEVICE_NAME = '<device>'
var APP_PACKAGE = '<package>'
var APP_ACTIVITY = '<activity>'

var driver = await remote({
  hostname: APPIUM_HOST,
  port: APPIUM_PORT,
  path: '/',
  logLevel: 'error',
  capabilities: {
    platformName: 'Android',
    'appium:deviceName': DEVICE_NAME,
    'appium:automationName': 'UiAutomator2',
    'appium:appPackage': APP_PACKAGE,
    'appium:appActivity': APP_ACTIVITY,
    'appium:noReset': true,
    'appium:newCommandTimeout': 120
  }
})
```

When more than one Android device is connected, use the exact device identifier required by the environment rather than relying on a generic device name.

Immediately verify the session and current UI:

```js
var currentPackage = await driver.getCurrentPackage()
var currentActivity = await driver.getCurrentActivity()
var pageSource = await driver.getPageSource()
;({
  sessionId: driver.sessionId,
  package: currentPackage,
  activity: currentActivity,
  sourceLength: pageSource.length
})
```

Do not interact until the reported package, page source, and expected target-screen markers agree.

## Inspect Before Interacting

Use a fresh `driver.getPageSource()` whenever the visible screen may have changed. Inspect semantic Android attributes such as `content-desc`, `resource-id`, `text`, `class`, `clickable`, `enabled`, and bounds before choosing a selector.

Prefer selectors in this order when the target supports them:

1. Accessibility ID from `content-desc`: `~loginButton`
2. Stable Android resource ID or UiSelector
3. UiSelector by stable text or description
4. Short, specific XPath when the semantic selectors above cannot express the target

Examples:

```js
var login = await driver.$('~loginButton')
var submit = await driver.$(
  'android=new UiSelector().resourceId("com.example:id/submit")'
)
var settings = await driver.$(
  'android=new UiSelector().text("Settings")'
)
var input = await driver.$('android.widget.EditText')
```

Do not guess screen coordinates when a semantic selector is available. Do not retain an element handle across navigation or repeated scrolling when the underlying native view may have been recreated; reacquire it from the current screen state.

Android page source is XML. Attribute values may contain XML entities such as `&amp;`; reason from the semantic value rather than blindly copying the serialized entity text into an exact selector.

## Screenshots

Use screenshots for visual verification and layout inspection. Keep them in memory.

```js
var screenshot = Buffer.from(await driver.takeScreenshot(), 'base64')
await opencode.emitImage({
  bytes: screenshot,
  mimeType: 'image/png'
})
```

Do not create a temporary screenshot file when the image is only needed by the agent.

## Forms and Keyboard Input

Inspect the current field before changing it. Use normal WebdriverIO element commands for supported editable controls:

```js
var field = await driver.$('android.widget.EditText')
await field.clearValue()
await field.setValue('example')
```

After changing a field, wait for the expected semantic UI change before activating the next control. Verify the resulting screen instead of treating a successful command return as proof that the application accepted the value.

For Android key events, use the session-level current WebdriverIO command supported by the driver, such as `driver.pressKeyCode(<Android KeyEvent code>)`. Do not depend on element-level keyboard helpers that the native driver does not expose.

## Scrolling

For low-level Android swipe gestures, use W3C pointer actions through `performActions()` and release the virtual pointer afterward. Derive coordinates from the current window instead of assuming a fixed device resolution.

```js
var rect = await driver.getWindowRect()
var x = Math.round(rect.width * 0.5)
var startY = Math.round(rect.height * 0.8)
var endY = Math.round(rect.height * 0.3)

await driver.performActions([
  {
    type: 'pointer',
    id: 'finger',
    parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', x, y: startY, duration: 0 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', x, y: endY, duration: 650 },
      { type: 'pointerUp', button: 0 }
    ]
  }
])
await driver.releaseActions()
```

Every `pointerMove` action must include a `duration`, including the initial move.

## Virtualized and Scrolling Lists

Treat each post-scroll screen as a new native view.

Before each gesture:

1. Read fresh page source.
2. Extract task-relevant stable item identities from accessibility text, content descriptions, or resource-backed labels.
3. Add those identities to a `Set`.
4. Perform one bounded scroll gesture.
5. Pause briefly for the list to settle.
6. Read fresh page source again.

Stop after a finite gesture limit or when a new screen adds no new relevant identities. Do not claim a complete result count until the collected identities have been deduplicated and the stopping condition has been verified.

When selecting an item from a virtualized list, locate it again from its stable identity immediately before clicking. Do not click an element handle retained from an earlier scroll position.

## Navigation and Readiness

Treat app activation, deep-link, back, and other navigation commands as requests to change state, not proof that the requested screen is ready.

After navigation:

- poll fresh page source for semantic target markers with a finite timeout;
- confirm the current package when the task depends on package identity;
- reacquire elements from the new screen;
- use a screenshot when visual state matters.

After `driver.back()`, always re-inspect the page source before using a selector from the previous screen.

If a requested transition leaves the app on a shell, stale screen, or unexpected package, inspect the observed state first. Reactivate or retry only when the current evidence justifies it, and keep retries bounded.

## Reliable Interaction Rules

- Keep cells small and sequential. Inspect, act, then verify.
- Reuse the persistent `driver` binding while the session remains healthy.
- Use `var` or reassign existing persistent bindings instead of repeatedly introducing top-level `const` or `let` names.
- Do not submit another `repl_node` evaluation while a prior evaluation remains active; inspect it with `repl_job` first.
- If the Appium session becomes invalid, recreate the WebdriverIO session. Do not reset the Node Cell merely because the remote Appium session ended.
- If the Node Cell itself is hard-retired or reset, recreate the Appium/WebdriverIO bindings before continuing.
- Do not assume every convenience element command is implemented by every native driver state. When a command is rejected, inspect current page source and use the supported session-level or protocol-level operation that matches the task.
- Use complete driver-level XPath expressions for ancestor traversal. Reacquire the resulting element after navigation or scrolling.

Cancellation is not rollback. App navigation, taps, text input, external requests, and other actions already sent to the device may remain in effect after an interrupted REPL evaluation.

## Verification

Before reporting a result:

- confirm `driver.sessionId` identifies an active session;
- confirm `driver.getCurrentPackage()` matches the expected package when package identity matters;
- confirm fresh page source contains the semantic markers required by the task;
- after each consequential interaction, verify the expected text, content description, resource-backed state, activity, or screenshot;
- for scrolling collection, verify deduplication and the bounded stopping condition.

Do not treat command success alone as UI verification.
