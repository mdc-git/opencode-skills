---
name: playwright-interactive
description: "Inspect and interact with websites or Electron apps through persistent Playwright sessions. Use for browser or Electron QA, navigation, form interaction, visual verification, and multi-step UI workflows."
---

# Playwright Interactive

Use persistent `repl_node` Playwright handles for browser and Electron QA.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this skill are to be interpreted as described in RFC 2119.

Sections marked **CRITICAL** are execution gates. If one is skipped or violated, stop the browser task, return to the unmet gate, and complete it; work performed beyond a skipped gate is not valid verification.

## REQUIRED: REPL Tools

`repl_node`, `repl_job`, and `repl_reset` are direct OpenCode tools.

The agent **MUST** invoke these tools directly through the tool interface. The agent **MUST NOT** use `execute` to discover, invoke, or wrap them.

For `repl_node`, pass Node.js or TypeScript source directly in its `code` argument.

Use `repl_job` to inspect, cancel, or provide stdin to a retained job. Use `repl_reset` only when losing bindings and browser handles is acceptable.

## Startup

Complete the runtime setup before launching a browser or Electron application.

### REQUIRED: Runtime Setup

OpenCode supplies the Base directory for this skill when it is loaded. Replace `SKILL_BASE` below with that exact directory, then run this cell directly in the persistent Node REPL. `ensureRuntime()` runs `scripts/install-playwright.mjs`, which installs or verifies the pinned Playwright and Camoufox runtime in `${XDG_CACHE_HOME:-$HOME/.cache}/opencode/playwright`, and points Playwright and Camoufox at it.

```js
var SKILL_BASE = '/exact/base-directory-from-loaded-skill'
var { ensureRuntime, openLocal, openRemote, openElectron, openTab, followAction } =
  require(`${SKILL_BASE}/scripts/browser-session.mjs`)
var { observe, findOverlays, ariaFind, settle } = require(`${SKILL_BASE}/scripts/observation.mjs`)
var { createHumanizedInput } = require(`${SKILL_BASE}/scripts/humanized-input.mjs`)
await ensureRuntime()
```

The first installation downloads browsers and can take minutes. If the setup cell returns an active job, the agent **MUST** use `repl_job` with `status` until the job reaches a terminal state before opening a browser.

### REQUIRED: Sequential REPL Calls

The agent **MUST** send each browser REPL cell as plain JavaScript in the `code` input of a direct `repl_node` tool call. The plugin executes every cell in the same persistent Node Cell.

Browser startup, inspection, and interaction cells do not need an inner tool call.

If `repl_node` returns a job whose state is `starting`, `running`, or `waiting_input`, do not submit another JavaScript cell while that job remains active. Use `repl_job` with `status` to inspect it, `cancel` to request cancellation, or `stdin` when input is required.

Every accepted evaluation has a five-second foreground window. An evaluation that remains active after that window continues as a background job. Terminal background completion is normally delivered through a synthetic session message; `repl_job` with `status` is the recovery path when another snapshot is needed.

Cancellation first requests a cooperative interrupt. If the job remains active after the fixed two-second grace period, the interpreter is hard-retired. A confirmed hard retirement loses the Node Cell's bindings and browser handles. If teardown cannot be confirmed, the Cell fails closed for the current plugin activation.

Cancellation is not rollback. Browser actions, requests, assignments, and filesystem writes may already have occurred, so inspect the result before replaying a consequential action.

If `repl_node` reports a parse error, correct the Node.js source and retry the same small cell without resetting the Node Cell.

### Opening A Browser

Run only the lines for one mode: a local URL uses standard Chromium, a remote URL uses Camoufox, and Electron uses its own launcher. Do not navigate in the opening cell. Web contexts follow the browser window size instead of Playwright's fixed 1280x720 default.

```js
// Local web: standard Chromium and normal Playwright input.
var { browser, context, page } = await openLocal({ headless: false })

// Remote web: Camoufox plus humanized input.
var { browser, context, page } = await openRemote({ headless: false })
var input = createHumanizedInput()

// Electron: normal Playwright input. args are passed to the Electron binary.
var { electronApp, appWindow } = await openElectron({ args: ['.'] })
```

Camoufox supplies the browser-level anti-detection behavior. `input` supplies only humanized input. Playwright owns pages, tabs, popups, navigation, locators, frames, waiting, screenshots and assertions. Local web and Electron use normal Playwright input, never `input`.

## REPL Authoring Rules

The persistent Node Cell uses Node's built-in REPL evaluator, transpiles each snippet as CommonJS, and keeps top-level bindings across cells. Author cells to reuse existing state rather than rebuild it, and keep the shared binding scope clean.

* **Use `var` for persistent handles.** `var` bindings persist and may be reassigned or redeclared across cells. `let` and `const` also persist, but normal Node lexical rules apply: redeclaring either name in a later cell raises a `SyntaxError` such as `Identifier 'X' has already been declared`. An interrupted cell is not transactional, so a lexical name can remain reserved even when its awaited initializer did not finish. Reassign an existing `var` handle (`page = await context.newPage()`) rather than introducing a parallel one; use `globalThis` or an async function for scratch state when appropriate.
* **Prefer reusing handles over re-creating them.** `browser`, `context`, `page`, `input`, `electronApp`, `appWindow`, `fs`, `path`, and any helper you assigned in a prior cell persist into the next one. Reference them directly instead of launching a browser again, loading a module again, or recomputing a value that already exists. If a value is missing or stale, reassign the existing name rather than introducing a parallel one.
* **Use `require()` for modules.** REPL snippets are transpiled as CommonJS. Use `require()` for Node built-ins and workspace packages, and an absolute path for the skill's `.mjs` modules. Do not rely on static import declarations or dynamic `import()` semantics in REPL cells.
* **Respect Node's module cache.** Loaded modules are cached and are not automatically invalidated when a file changes. Reset the Node Cell before expecting an edited module to execute again, then rerun the runtime setup and open the browser again.
* **It is a Node Cell, not a browser.** `location`, `document`, `window`, `navigator`, and `localStorage` are not defined. Reach the DOM through Playwright: `await page.evaluate(() => location.href)` or `await page.locator(...)`. Use `os.tmpdir()` and `process.cwd()` for filesystem work, not browser URLs.
* **Emit screenshots directly.** Use `opencode.emitImage({ bytes: await page.screenshot({ type: 'png' }), mimeType: 'image/png' })` to return a screenshot to the agent without writing a file.
* **Keep cells small and one-purpose.** A long single-line expression built by concatenation (regexes, nested `map`/`filter`, multiple `=>` arrows) is the main source of `Expected '}' / ']' / ')'` and `missing ) after argument list` parse errors. Split it across lines and statements; the Node Cell preserves bindings between calls, so you do not lose state by splitting.

## Persistent Profiles

Profile persistence is opt-in: pass `profileDir` to `openLocal()` or `openRemote()` only when the user explicitly asks to reuse a profile and supplies the exact directory. A persistent profile may contain credentials, cookies and browsing history. Never inspect or expose those values unless the task explicitly requires it. If Playwright reports that the profile is locked, ask the user to close the other browser; never delete lock files.

## Observing And Targeting

Work from Playwright's AI accessibility snapshot. It lists roles, accessible names, states and a ref for every element that can be acted on, at a fraction of the size of HTML, and every ref is directly actionable. A screenshot yields no locators, and raw HTML is mostly markup: a Wikipedia article is about 500k characters of HTML. Observe with the snapshot, act on its refs and verify with it. Fall back to DOM inspection or screenshots only when the snapshot cannot answer the question (see Escalation).

When the task itself is visual, such as layout or design review, visual QA or a requested screenshot, screenshots are primary evidence, not a fallback.

### Snapshot Loop

1. **Outline at low depth.** On a new page or after a large change, take a shallow snapshot. At `depth: 3` it is usually under 1k characters and shows landmarks, dialogs and top-level regions with their refs.

   ```js
   var outline = await page.ariaSnapshot({ mode: 'ai', depth: 3 })
   outline
   ```

2. **Narrow before reading more.** Never return an unbounded full-page snapshot from a cell; a full Wikipedia article snapshot is about 280k characters. Scope the snapshot to the region that matters, using a ref from the outline, a dialog, a form or a row.

   ```js
   var region = await page.locator('aria-ref=e107').ariaSnapshot({ mode: 'ai', depth: 4 })
   var dialogTree = await page.getByRole('dialog').ariaSnapshot({ mode: 'ai' })
   ```

   Alternatively, keep the full tree in a variable and search it with `ariaFind(tree, pattern, max = 40)`, which the runtime setup loads. It returns the lines matching a case-insensitive pattern together with their ancestor lines, so a 3,000-line tree answers "where is the search box" in about ten lines:

   ```js
   var tree = await page.ariaSnapshot({ mode: 'ai' })
   ariaFind(tree, 'searchbox|button "Search"')
   ```

3. **Act on the ref.** Pass a ref locator to humanized input on remote web, or to Playwright actions on local web and Electron:

   ```js
   await input.fill(page, page.locator('aria-ref=e23'), 'screen reader')
   await page.locator('aria-ref=e25').click()
   ```

4. **Verify from the tree.** Check the evidence the action should change: the URL, a locator state such as checked, expanded, value or visibility, or a scoped re-snapshot of the affected region. The re-snapshot also supplies fresh refs for the next step.

5. **Convert refs before consolidating.** Refs are ephemeral. Before a proven step goes into a script, turn its ref into a durable locator while the ref is still current. `normalize()` also turns a working CSS or XPath locator into a user-facing one.

   ```js
   (await page.locator('aria-ref=e25').normalize()).toString()
   // getByRole('button', { name: 'Search' })
   ```

When the target is already known because the user named it or a previous snapshot established it, use `getByRole`, `getByLabel` or `getByText` directly instead of taking another snapshot. Use `page.pickLocator()` only when the user is co-piloting the headed browser, because it waits for a human click.

### Reading The Snapshot

```yaml
- form "Profile form" [ref=e183]:
  - textbox "Email" [active] [ref=e185]:
    - /placeholder: you@example.com
  - checkbox "Agree" [checked] [ref=e187]
  - combobox "Plan" [ref=e188]:
    - option "Free" [selected]
  - button "Submit" [ref=e189]
- generic [ref=e182] [cursor=pointer]: Open card
- button [ref=e175]:
  - img [ref=e176]
- iframe [ref=e191]:
  - button "Pay now" [ref=f1e2]
```

* `[ref=…]` marks elements that are visible and receive pointer events; lines without a ref are context. Refs inside iframes carry a frame prefix such as `f1e2` and resolve from `page` directly. Copy refs verbatim.
* `[active]` is focus. `[checked]`, `[disabled]`, `[expanded]`, `[pressed]` and `[selected]` are states, and `[level=n]` is a heading level. `/url:` and `/placeholder:` are properties. Text after a colon is the element's text or current value.
* `generic [cursor=pointer]` is a clickable custom element without a role, and it is a valid target. An unnamed `button` whose only child is an `img` is an icon button; identify it from surrounding context or an element screenshot.
* `boxes: true` appends viewport coordinates as `[box=x,y,width,height]`. Add it only when geometry matters.

### Ref Lifetime

A ref resolves against the latest snapshot taken in its frame. Use refs only from a snapshot taken after the most recent navigation or state change.

* A scoped snapshot replaces the frame's ref table, so refs from an earlier full snapshot that fall outside the new scope stop resolving.
* An unresolved ref raises no stale-ref error: `count()` returns 0 and actions wait until they time out. Take a new snapshot instead of retrying.
* Numbering restarts on a new document. After navigation and a new snapshot, an old ref can silently resolve to a different element, so never carry refs across navigation.

### What The Snapshot Does Not Show

The snapshot is a semantic projection, not a picture or a complete DOM inventory. A visible element can be missing from it, so absence from the tree does not prove absence from the screen.

* **Stacking and overlays.** A covered element still has a ref. `findOverlays(page)` reports which elements cover controls. When humanized input reports `Humanized input target is obscured by <…>`, or Playwright reports that another element `intercepts pointer events`, the message names the covering element; deal with it first.
* **Pixels.** Canvas, WebGL, maps, charts, image content, colors, layout and visual order are not represented.
* **Weak semantics.** Unnamed icon buttons, custom widgets without roles, closed shadow roots and cross-origin frames without a child tree.
* **Unmounted content.** Virtualized and infinite lists contain only rendered rows; scroll, then re-snapshot. Off-screen elements can still appear with refs; input actions reveal them before acting.
* **Transient content.** Toasts and live regions can vanish before the next snapshot. Read them with a locator immediately after the action.

### Escalation

Escalate one level at a time, and only as far as the question requires:

1. A different scope, a deeper `depth` on the region, or another `ariaFind` pattern.
2. Targeted locator probes on one element: `count()`, `isVisible()`, `inputValue()`, `getAttribute('aria-expanded')` or `textContent()`. To read page content, use `innerText()` on a scoped region rather than on the whole page.
3. An element screenshot: `opencode.emitImage({ bytes: await locator.screenshot(), mimeType: 'image/png' })`.
4. A viewport screenshot for layout, overlays, CAPTCHA or visual QA.
5. `evaluate()` or `outerHTML` on one element or a small subtree for implementation questions. Use `page.content()` only to diagnose a missing subtree, never to find elements.

Inspect frame URLs with `page.frames().map((frame) => frame.url())` when a frame's content is missing from the snapshot, then work inside it with `frameLocator()` or `locator.contentFrame()`. Locators pierce open shadow roots; closed shadow roots are unreachable through standard locators.

## REQUIRED: Tabs And Popups

Camoufox shows browser-originated windows as tabs of the existing window, but a page created with `context.newPage()` can appear as a separate window even though `context.pages()` lists it in the same context. On remote web the agent **MUST NOT** call `context.newPage()`. Navigate the opening page to the first target and open each further page with `openTab()`, which opens it through the current page's `window.open()`. Open one tab per cell and check the tab list before opening the next:

```js
page = await openTab(page, TARGET_URL)
;({ tabs: context.pages().map((candidate) => candidate.url()) })
```

When an action may navigate the page, open a popup or do neither, wrap it in `followAction()` instead of assuming the outcome. It returns `kind` as `new-page`, `same-page` or `no-navigation`, and the page to continue on:

```js
var result = await followAction(page, () => input.click(page, page.locator('aria-ref=e42')))
page = result.page
;({ kind: result.kind, tabs: result.pages })
```

## CRITICAL: Mandatory Remote Cleanup Gate

**CRITICAL:** This mandatory gate **MUST** be the first activity after the first navigation to each remote origin. Before extracting task content, starting the requested workflow, performing the proving pass, or reporting any result, the agent **MUST** complete all of these steps in order:

1. The agent **MUST** run `await settle(page, { quietMs: 1500 })`. Consent managers often arrive after a network round-trip during which the document is quiet, so a shorter quiet window can end before they appear.
2. The agent **MUST** run `await observe(page)` and evaluate all of its parts:
   * `overlays` hit-tests the centre of every visible control in the viewport and groups the covered ones by the outermost element on top. A consent layer or modal usually covers most of the `checked` controls; one to three covered controls are usually layout, such as card-wide links or menus under a sticky header. `unreachable` counts controls that hit nothing, which happens when a modal makes the rest of the page inert. Inspect each real overlay with `await page.locator(overlay.locator).ariaSnapshot({ mode: 'ai' })`; the scoped snapshot includes iframe content such as consent frames.
   * `outline` exposes banners that sit in the page flow and cover nothing. Look for cookie, consent and privacy wording in the page's language.
   * `tabs` lists popup pages.

   The snapshot alone **MUST NOT** be used to conclude that no interruption exists; the overlay check is required. The agent **MUST** emit a viewport screenshot with `opencode.emitImage({ bytes: await page.screenshot({ type: 'png' }), mimeType: 'image/png' })` and visually inspect it when the outline is nearly empty or does not match the expected site, when an overlay's scoped snapshot shows no usable controls, or when `overlays` and `outline` disagree.
3. If a cookie or consent prompt is visible, the agent **MUST** choose the affirmative control whose meaning is to accept or allow all cookie categories. Its wording and language vary by site, so the agent **MUST** identify it by meaning rather than rely on a fixed label such as `Accept all`. It **MUST NOT** choose a narrower, rejecting or settings option unless the user asks.
4. The agent **MUST** dismiss every unrelated, benign interruption that has a safe visible dismissal control. This includes newsletter prompts, surveys, promotional modals, chat invitations, interstitials and unrelated popup pages. Controls may mean close, dismiss, cancel, skip, continue without, not now or an equivalent phrase in another language. The agent **MUST** identify controls from snapshot refs or Playwright locators and activate them with humanized input. It **MUST NOT** close a popup page until Playwright inspection confirms that the page is unrelated to the requested flow.
5. In a separate pass, the agent **MUST** run `observe(page)` again and confirm that no dismissed layer still covers controls, that each cookie prompt and unrelated popup is gone, and that the intended workflow page is active. It **MUST** emit and inspect a fresh screenshot when step 2 needed one or when the result is unclear. A timed-out dismissal click can still have succeeded when the control removed itself; the agent **MUST** judge success by this verified end state and **MUST NOT** retry blindly.

The gate **MUST NOT** be considered complete while a visible cookie prompt or safely dismissible unrelated interruption remains. If a control cannot be identified confidently or the interruption cannot be dismissed, the agent **MUST** stop and inspect rather than begin the task underneath it.

The agent **MUST NOT** automatically dismiss anything that may be relevant to the task, including authentication, permission decisions, destructive confirmations, validation errors, checkout or submission confirmation, file choosers, or dialogs whose consequence is unclear. It **MUST** inspect or ask instead of guessing.

Interruptions can appear later. If a cookie prompt, overlay, modal, interstitial or popup page appears at any point, the agent **MUST** pause the current workflow immediately, apply the same inspect-dismiss-verify gate, and **MUST NOT** resume the task until that gate is complete.

## CRITICAL: Mandatory Proof Gate Before Automation

**CRITICAL:** The agent **MUST NOT** write or execute a large multi-step script, loop, helper or batch of interactions based on untested assumptions about selectors, page state or transitions. Before automating a flow, it **MUST** use the persistent REPL to complete the proposed flow successfully at least once as small, sequential Playwright operations.

For the proving pass, the agent **MUST** inspect the current state, choose the next locator, perform one interaction, and verify its expected visible result before continuing. A locator resolving successfully **MUST NOT** be treated as proof that the interaction or transition works. The agent **MUST NOT** bundle an unproven next step into the same call.

Only after the complete representative sequence has worked once **MAY** the agent consolidate those exact proven steps into a larger script or repeated automation. If the UI, navigation outcome, popup behavior or other assumption differs from the proving pass, the agent **MUST** stop the automation at that divergence and **MUST** prove the changed path one step at a time before updating the script.

The agent **MUST NOT** preemptively build fallback trees, speculative selector lists, retry loops or broad DOM-evaluation scripts to cover states that have not been observed. It **MUST** inspect the actual state first and **MUST** prove each required branch before including that branch in automation.

Runtime setup, opening the browser, read-only inspection and a single isolated interaction **MAY** proceed without a prior proving pass because they are not automation. Irreversible or externally consequential actions **MUST** remain incremental and **MUST NOT** be repeated merely to prove that a consolidated script can replay them.

## Humanized Input

For remote web, pass ordinary Playwright locators directly to `input`:

```js
await input.click(page, page.getByRole('button', { name: 'Continue' }))
await input.fill(page, page.getByLabel('Email'), 'user@example.com')
await input.hover(page, page.getByRole('link', { name: 'Details' }))
await input.check(page, page.getByLabel('Remember me'))
await input.selectOption(page, page.getByLabel('Country'), 'DE')
await input.focus(page, page.getByRole('textbox', { name: 'Search' }))
await input.press(page, 'Enter')
await input.scroll(page, 850)
```

Available methods are `moveTo`, `click`, `doubleClick`, `hover`, `wheel`, `scroll`, `dragTo`, `type`, `fill`, `pressText`, `press`, `focus`, `check`, `uncheck`, and `selectOption`.

`press` and `pressText` operate on the page's currently focused element and accept `(page, key)` and `(page, text)` respectively. Use `focus(page, locator)` first when focus is not already established. Other keyboard and form methods such as `type`, `fill`, `focus`, `check`, `uncheck`, and `selectOption` accept a locator as their second argument.

`fill` and `type` click the field before typing. `fill` selects and replaces its contents; `type` moves the caret to the end and appends. `focus` focuses without clicking, so focusing a button does not activate it.

Before locator-based pointer actions, the module tries wheel input to reveal off-screen targets, including targets in nested scroll containers. It re-measures after each wheel gesture. Programmatic scrolling is the fallback for frame targets, inaccessible scroll regions, stalled scrolling or the bounded attempt limit. Hit-testing can also adjust scroll alignment to uncover a target. `scroll(page, locator)` reveals a target; `scroll(page, locator, deltaY)` wheels over it; `scroll(page, deltaY)` wheels at the current pointer position, placing an unplaced pointer near the viewport centre first.

The module uses locator bounding boxes and hit testing only to execute pointer input against the Playwright-selected target. It does not search for, reinterpret or replace the locator.

Use direct Playwright methods such as `page.goto()`, `page.goBack()` and `context.pages()` for lifecycle and navigation.

Humanized typing is intentionally slower, so input cells often continue as background jobs.

## Navigation And Inspection

Navigate to the user-requested origin and reach later states through visible UI controls. Do not invent deep links, query strings or form endpoints to bypass the UI.

After completing the mandatory remote cleanup gate, check whether the requested information is already on the page, using a scoped snapshot or `innerText()` of the relevant region. If it is, read it without unnecessary task interaction.

Prefer Playwright's actionability and observable state changes over fixed sleeps. Use the signal that matches the expected result:

* `page.waitForURL()` when the action should change the main-page URL.
* `followAction()` when the action may open another page.
* A locator state such as visible/hidden/enabled, text, value or count when the action updates the current DOM.
* `settle(page)` when content is still loading and no specific signal exists. It waits until the document stops changing for `quietMs` (default 500) and reports `timedOut: true` for pages that never stop changing. Never use `page.waitForTimeout()` as a wait.

When the current state or target is unclear, take a scoped snapshot rather than guessing selectors.

For debugging a broken transition, inspect the browser's stored diagnostics before adding retries:

```js
var consoleMessages = await page.consoleMessages({ filter: 'since-navigation' })
var pageErrors = await page.pageErrors({ filter: 'since-navigation' })
;({ console: consoleMessages.slice(-20).map((m) => m.text()),
    errors: pageErrors.slice(-20).map((e) => String(e)) })
```

These diagnostics are especially useful when the UI appears stuck after a click even though the locator and input action succeeded.

## Session Persistence

Keep browser and Electron sessions open after completing a task. Close them only when the user asks, when switching an exclusive persistent profile between incompatible sessions, or before an unavoidable reset.

```js
if (typeof electronApp !== 'undefined') await electronApp.close().catch(() => {})
if (typeof context !== 'undefined') await context.close().catch(() => {})
if (typeof browser !== 'undefined') await browser.close().catch(() => {})
;('Playwright session closed')
```

After `repl_reset({ language: 'node' })` or a hard interpreter retirement, rerun the runtime setup and open the browser again before interacting.

If an expected persistent binding such as `browser`, `context`, `page`, or `input` is not defined, the agent **MUST** reload the `playwright-interactive` skill, rerun the runtime setup and open the browser again. It **MUST NOT** reconstruct a partial lifecycle from memory or stale tool output in the transcript.
