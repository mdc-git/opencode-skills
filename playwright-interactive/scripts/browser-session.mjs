import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const PLAYWRIGHT_CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME || path.join(process.env.HOME || os.homedir(), '.cache'),
  'opencode',
  'playwright'
)
const playwrightRequire = createRequire(path.join(PLAYWRIGHT_CACHE_DIR, '__playwright__.cjs'))

// Installs or verifies the pinned runtime and points Playwright and Camoufox
// at it. Run once per Node Cell before opening a browser.
export async function ensureRuntime() {
  await promisify(execFile)(process.execPath, [path.join(SCRIPTS_DIR, 'install-playwright.mjs')], {
    env: process.env,
    maxBuffer: 1024 * 1024
  })
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(PLAYWRIGHT_CACHE_DIR, 'browsers')
  process.env.CAMOUFOX_INSTALL_DIR = path.join(PLAYWRIGHT_CACHE_DIR, 'camoufox')
  process.env.TMPDIR = path.join(PLAYWRIGHT_CACHE_DIR, 'tmp')
  return PLAYWRIGHT_CACHE_DIR
}

// Standard Chromium for local web. The viewport follows the window size.
export async function openLocal({ headless = false, profileDir } = {}) {
  const { chromium } = playwrightRequire('playwright')
  if (profileDir) {
    const context = await chromium.launchPersistentContext(profileDir, { headless, viewport: null })
    return { browser: context.browser(), context, page: context.pages()[0] || (await context.newPage()) }
  }

  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({ viewport: null })
  return { browser, context, page: await context.newPage() }
}

// Camoufox for remote web. Browser-originated windows open as tabs in the
// same window; open further pages with openTab(), never context.newPage().
export async function openRemote({ headless = false, profileDir } = {}) {
  const { firefox } = playwrightRequire('playwright-core')
  const { launchOptions } = playwrightRequire('camoufox-js')
  const camoufoxOptions = await launchOptions({ enable_cache: true })
  const options = {
    ...camoufoxOptions,
    firefoxUserPrefs: {
      ...camoufoxOptions.firefoxUserPrefs,
      'browser.link.open_newwindow': 3,
      'browser.link.open_newwindow.restriction': 0
    },
    headless
  }
  if (profileDir) {
    const context = await firefox.launchPersistentContext(profileDir, { ...options, viewport: null })
    const page = context.pages()[0]
    if (!page) throw new Error('Persistent context opened without a startup page')
    return { browser: context.browser(), context, page }
  }

  const browser = await firefox.launch(options)
  const context = await browser.newContext({ viewport: null })
  return { browser, context, page: await context.newPage() }
}

export async function openElectron({ args = ['.'] } = {}) {
  const electronApp = await playwrightRequire('playwright')._electron.launch({ args })
  const appWindow = await electronApp.firstWindow()
  appWindow.setDefaultTimeout(10000)
  return { electronApp, appWindow }
}

// Opens url in a new tab created by the browser itself, so Camoufox shows it
// as a tab of the existing window.
export async function openTab(page, url) {
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    page.evaluate((target) => window.open(target, '_blank'), url)
  ])
  await tab.waitForLoadState('domcontentloaded')
  return tab
}

// Runs an action that may navigate the page, open a new page or do neither,
// and reports which happened. kind is 'new-page', 'same-page' or 'no-navigation'.
export async function followAction(page, action, { timeout = 1500 } = {}) {
  const context = page.context()
  const pagesBefore = new Set(context.pages())
  const urlBefore = page.url()
  const pageEvent = context.waitForEvent('page', { timeout }).catch(() => undefined)
  await action()
  if (!(await pageEvent)) {
    await page.waitForURL((url) => url.href !== urlBefore, { timeout }).catch(() => {})
  }

  const opened = context.pages().filter((candidate) => !pagesBefore.has(candidate))
  if (opened.length === 1) await opened[0].waitForLoadState('domcontentloaded')
  const kind = opened.length ? 'new-page' : page.url() !== urlBefore ? 'same-page' : 'no-navigation'
  return {
    kind,
    page: opened.length === 1 ? opened[0] : page,
    pages: context.pages().map((candidate) => candidate.url())
  }
}
