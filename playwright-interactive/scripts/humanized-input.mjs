import { createMoveHelpers, pageViewport, performWheelSteps } from './humanized-input-actions.mjs'
import { createInputHelpers } from './humanized-input-input.mjs'
import { sleep, uniform } from './humanized-input-utils.mjs'

const DEFAULT_PROFILE = Object.freeze({
  profileId: 'humanized-input',
  clickPrecision: 2.5,
  curveFactor: 0.15,
  overshootChance: 0.55,
  overshootMin: 5,
  overshootMax: 15,
  tremorCount: 3,
  tremorAmplitude: 1.5,
  clickHoldMin: 50,
  clickHoldMax: 120,
  typingMean: 90,
  typingSigma: 0.3,
  keyHoldMin: 40,
  keyHoldMax: 110,
  actionGapMean: 400,
  actionGapSigma: 0.35,
  fittsIntercept: 90,
  fittsSlope: 110,
  fittsMinDuration: 60,
  fittsMaxDuration: 900
})

function requirePage(currentPage) {
  if (!currentPage || typeof currentPage.isClosed !== 'function' || currentPage.isClosed()) {
    throw new Error('Humanized input requires an open Playwright Page')
  }

  return currentPage
}

function createActionQueue() {
  const stateByPage = new WeakMap()
  const stateFor = (currentPage) => {
    requirePage(currentPage)
    let state = stateByPage.get(currentPage)
    if (!state) {
      state = { x: undefined, y: undefined, queue: Promise.resolve() }
      stateByPage.set(currentPage, state)
    }

    return state
  }

  const queue = (currentPage, action) => {
    const state = stateFor(currentPage)
    const run = () => action(state)
    const result = state.queue.then(run)
    state.queue = result.catch(() => {})
    return result
  }

  return queue
}

function createPointerVerbs({ queue, moveToPoint, moveToTarget, performClick }) {
  const click = (currentPage, target, options = {}, count = 1) =>
    queue(currentPage, (state) => performClick(currentPage, state, target, { ...options, count }))
  // Camoufox ignores wheel input until the pointer has moved, so an unplaced
  // pointer first rests near the middle of the viewport.
  const wheel = (currentPage, deltaX, deltaY, target) =>
    queue(currentPage, async (state) => {
      if (target !== undefined) {
        await moveToTarget(currentPage, state, target)
      } else if (state.x === undefined) {
        const size = await pageViewport(currentPage)
        await moveToPoint(currentPage, state, {
          x: size.width * uniform(0.35, 0.65),
          y: size.height * uniform(0.35, 0.65)
        })
      }

      await performWheelSteps(currentPage, deltaX, deltaY, requirePage)
    })

  return {
    moveTo: (currentPage, target) =>
      queue(currentPage, (state) => moveToTarget(currentPage, state, target)),
    click: (currentPage, target, options) => click(currentPage, target, options),
    doubleClick: (currentPage, target, options) => click(currentPage, target, options, 2),
    hover: (currentPage, target) =>
      queue(currentPage, (state) => moveToTarget(currentPage, state, target)),
    wheel,
    scroll(currentPage, targetOrDelta, deltaY) {
      if (typeof targetOrDelta === 'number') {
        return wheel(currentPage, 0, targetOrDelta)
      }

      if (Number.isFinite(deltaY)) {
        return wheel(currentPage, 0, deltaY, targetOrDelta)
      }

      return queue(currentPage, (state) => moveToTarget(currentPage, state, targetOrDelta))
    },
    dragTo: (currentPage, source, target) =>
      queue(currentPage, async (state) => {
        await moveToTarget(currentPage, state, source)
        await source.dragTo(target)
      })
  }
}

function createKeyboardVerbs({ queue, moveToTarget, performClick, typeText, profile }) {
  return {
    type: (currentPage, target, text) =>
      queue(currentPage, async (state) => {
        await performClick(currentPage, state, target)
        await currentPage.keyboard.press('ControlOrMeta+End')
        await typeText(currentPage, text)
      }),
    fill: (currentPage, target, text) =>
      queue(currentPage, async (state) => {
        await performClick(currentPage, state, target)
        await currentPage.keyboard.press('ControlOrMeta+A')
        await currentPage.keyboard.press('Backspace')
        await typeText(currentPage, text)
      }),
    pressText: (currentPage, text) => queue(currentPage, () => typeText(currentPage, text)),
    press: (currentPage, key) =>
      queue(currentPage, () =>
        currentPage.keyboard.press(key, { delay: uniform(profile.keyHoldMin, profile.keyHoldMax) })
      ),
    focus: (currentPage, target) =>
      queue(currentPage, async (state) => {
        await moveToTarget(currentPage, state, target)
        await target.focus()
      })
  }
}

function createFormVerbs({ queue, moveToTarget, performClick }) {
  return {
    check: (currentPage, target) =>
      queue(currentPage, async (state) => {
        if (!(await target.isChecked())) {
          await performClick(currentPage, state, target)
        }
      }),
    uncheck: (currentPage, target) =>
      queue(currentPage, async (state) => {
        if (await target.isChecked()) {
          await performClick(currentPage, state, target)
        }
      }),
    selectOption: (currentPage, target, values) =>
      queue(currentPage, async (state) => {
        await moveToTarget(currentPage, state, target)
        await target.focus()
        await sleep(uniform(80, 180))
        return target.selectOption(values)
      })
  }
}

export function createHumanizedInput({ profile: profileOverrides = {} } = {}) {
  const profile = Object.freeze({ ...DEFAULT_PROFILE, ...profileOverrides })
  const queue = createActionQueue()

  const { moveToPoint, moveToTarget, revealTarget } = createMoveHelpers(profile, pageViewport, requirePage)
  const { typeText, performClick } = createInputHelpers(profile, moveToPoint, revealTarget)
  const deps = { queue, moveToPoint, moveToTarget, performClick, typeText, profile }

  return Object.freeze({
    profile,
    ...createPointerVerbs(deps),
    ...createKeyboardVerbs(deps),
    ...createFormVerbs(deps)
  })
}
