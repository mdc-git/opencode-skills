#!/usr/bin/env node

import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const PLAYWRIGHT_VERSION = '1.60.0'
const CAMOUFOX_VERSION = '0.12.0'
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SKILL_DIR = path.dirname(path.dirname(SCRIPT_PATH))
const PLAYWRIGHT_CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME || path.join(process.env.HOME || os.homedir(), '.cache'),
  'opencode',
  'playwright'
)
const PLAYWRIGHT_BROWSERS_PATH = path.join(PLAYWRIGHT_CACHE_DIR, 'browsers')
const CAMOUFOX_INSTALL_DIR = path.join(PLAYWRIGHT_CACHE_DIR, 'camoufox')
const TEMP_DIR = path.join(PLAYWRIGHT_CACHE_DIR, 'tmp')
const LOCK_PATH = path.join(PLAYWRIGHT_CACHE_DIR, '.playwright-setup.lock')
const PLAYWRIGHT_HOST_PLATFORM_OVERRIDE =
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ||
  (process.platform === 'linux' && process.arch === 'x64' && isUbuntu2604()
    ? 'ubuntu24.04-x64'
    : undefined)
const REQUIRED_HELPERS = [
  'humanized-input.mjs',
  'humanized-input-actions.mjs',
  'humanized-input-input.mjs',
  'humanized-input-target.mjs',
  'humanized-input-utils.mjs'
]

if (PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) {
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = PLAYWRIGHT_HOST_PLATFORM_OVERRIDE
}

const setupEnv = {
  ...process.env,
  PLAYWRIGHT_CACHE_DIR,
  PLAYWRIGHT_BROWSERS_PATH,
  CAMOUFOX_INSTALL_DIR,
  TMPDIR: TEMP_DIR
}

function isUbuntu2604() {
  try {
    const release = fs.readFileSync('/etc/os-release', 'utf8')
    return /(?:^|\n)ID=ubuntu(?:\n|$)/u.test(release) &&
      /(?:^|\n)VERSION_ID="?26\.04"?(?:\n|$)/u.test(release)
  } catch {
    return false
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: setupEnv, stdio: 'inherit' })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
    })
  })
}

function packageVersion(name) {
  try {
    const packagePath = path.join(PLAYWRIGHT_CACHE_DIR, 'node_modules', name, 'package.json')
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version
  } catch {
    return undefined
  }
}

function packagesReady() {
  return (
    packageVersion('playwright') === PLAYWRIGHT_VERSION &&
    packageVersion('playwright-core') === PLAYWRIGHT_VERSION &&
    packageVersion('camoufox-js') === CAMOUFOX_VERSION
  )
}

function chromiumReady() {
  try {
    const requireFromCache = createRequire(path.join(PLAYWRIGHT_CACHE_DIR, '__playwright__.cjs'))
    const playwright = requireFromCache('playwright')
    return fs.existsSync(playwright.chromium.executablePath())
  } catch {
    return false
  }
}

function camoufoxReady() {
  return fs.existsSync(path.join(CAMOUFOX_INSTALL_DIR, 'version.json'))
}

function helpersReady() {
  return REQUIRED_HELPERS.every((helper) => fs.existsSync(path.join(SKILL_DIR, 'scripts', helper)))
}

async function install() {
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  if (!process.argv.includes('--locked')) {
    await run('flock', ['-x', LOCK_PATH, process.execPath, SCRIPT_PATH, '--locked'])
    return
  }

  if (!packagesReady()) {
    await run('npm', [
      'install',
      '--prefix',
      PLAYWRIGHT_CACHE_DIR,
      `playwright@${PLAYWRIGHT_VERSION}`,
      `camoufox-js@${CAMOUFOX_VERSION}`
    ])
    fs.rmSync(CAMOUFOX_INSTALL_DIR, { recursive: true, force: true })
  }

  if (!chromiumReady()) {
    await run('npx', ['--prefix', PLAYWRIGHT_CACHE_DIR, 'playwright', 'install', 'chromium'])
  }

  if (!camoufoxReady()) {
    await run('npx', ['--prefix', PLAYWRIGHT_CACHE_DIR, 'camoufox-js', 'fetch'])
  }

  if (!packagesReady() || !chromiumReady() || !camoufoxReady()) {
    throw new Error('Playwright runtime verification failed')
  }

  if (!helpersReady()) {
    throw new Error(`Required humanized-input helpers are missing from ${SKILL_DIR}/scripts`)
  }

  console.log(`Playwright runtime ready at ${PLAYWRIGHT_CACHE_DIR}`)
}

install().catch((error) => {
  console.error(`Playwright runtime setup failed: ${error.message}`)
  process.exitCode = 1
})
