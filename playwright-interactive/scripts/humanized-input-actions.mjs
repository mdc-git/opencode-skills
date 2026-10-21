import {
  FALLBACK_VIEWPORT,
  clamp,
  fittsDuration,
  pathBetween,
  pointFor,
  sequence,
  sleep,
  uniform
} from './humanized-input-utils.mjs'
import { isLocatorTarget, targetBox, validateTarget } from './humanized-input-target.mjs'

const REVEAL_ROUNDS = 15
const REVEAL_STEP_LIMIT = 1100

function remainingTime(deadline) {
  if (!deadline) return deadline
  const remaining = deadline - performance.now()
  if (remaining <= 0) throw new Error('Humanized input target reveal timed out')
  return remaining
}

function computeEasing(duration, index, total, elapsed) {
  const t = (index + 2) / total
  const twice = 2 * t
  const eased = duration * t * t * (3 - twice)
  return { slice: eased - elapsed, eased }
}

async function pageViewport(currentPage) {
  const size = currentPage.viewportSize()
  if (size) {
    return size
  }

  return currentPage
    .evaluate(
      ({ width, height }) => ({ width: innerWidth || width, height: innerHeight || height }),
      FALLBACK_VIEWPORT
    )
    .catch(() => ({ ...FALLBACK_VIEWPORT }))
}

async function performWheelSteps(currentPage, deltaX, deltaY, requirePage, deadline) {
  const magnitude = Math.max(Math.abs(deltaX), Math.abs(deltaY))
  if (magnitude === 0) {
    return
  }

  const step = async (remainingX, remainingY, impulse, steps) => {
    requirePage(currentPage)
    remainingTime(deadline)
    if (steps >= 24) {
      await currentPage.mouse.wheel(remainingX, remainingY)
      return
    }

    const share = clamp(impulse / Math.max(1, Math.hypot(remainingX, remainingY)), 0.12, 1)
    const stepX = remainingX * share
    const stepY = remainingY * share
    const restX = remainingX - stepX
    const restY = remainingY - stepY
    await currentPage.mouse.wheel(stepX, stepY)
    if (Math.max(Math.abs(restX), Math.abs(restY)) <= 0.5) {
      return
    }

    const nextImpulse = impulse * 0.78 * uniform(0.85, 1.1)
    const pause = nextImpulse > 90 ? uniform(16, 42) : uniform(55, 110)
    await sleep(Math.min(pause, remainingTime(deadline) || Infinity))
    await step(restX, restY, nextImpulse, steps + 1)
  }

  await step(deltaX, deltaY, clamp(magnitude * uniform(0.3, 0.5), 48, 360), 0)
}

// Runs in the target's frame. Returns null when the target's centre is
// comfortably visible, otherwise where to put the pointer and how far to wheel:
// the innermost scroll container that clips the target scrolls first, and the
// page scrolls with the pointer over a point that no inner scroller captures.
function planReveal(element, pointer) {
  if (window !== window.top) return { programmatic: true }

  const margin = 24
  // body's overflow belongs to the viewport unless the root element sets its
  // own overflow; then body clips and scrolls like any other container.
  const rootStyle = getComputedStyle(document.documentElement)
  const pageRoot = rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible' ? document.body : document.documentElement
  const parentOf = (node) => node.assignedSlot || node.parentElement || node.getRootNode().host
  const scrolls = (node) => {
    const style = getComputedStyle(node)
    return (
      (/auto|scroll|overlay/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) ||
      (/auto|scroll|overlay/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1)
    )
  }
  const scrollersOf = (node) => {
    const found = []
    for (let current = parentOf(node); current && current !== pageRoot; current = parentOf(current)) {
      const style = getComputedStyle(current)
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') found.push(current)
    }
    return found
  }
  const intersect = (a, b) => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom)
  })
  const isEmpty = (rect) => rect.right - rect.left < 2 * margin || rect.bottom - rect.top < 2 * margin
  const contains = (rect, point) =>
    point.x >= rect.left + margin && point.x <= rect.right - margin &&
    point.y >= rect.top + margin && point.y <= rect.bottom - margin
  const centreOf = (rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 })
  const wheelToward = (point, region, at) => {
    const centre = centreOf(region)
    const height = region.bottom - region.top
    return {
      x: at.x,
      y: at.y,
      dx: point.x >= region.left + margin && point.x <= region.right - margin ? 0 : point.x - centre.x,
      dy: point.y >= region.top + margin && point.y <= region.bottom - margin ? 0 : point.y - centre.y + (Math.random() - 0.5) * height * 0.3
    }
  }
  const pointerIn = (region) =>
    pointer && contains(region, pointer)
      ? pointer
      : {
          x: region.left + (region.right - region.left) * (0.3 + Math.random() * 0.4),
          y: region.top + (region.bottom - region.top) * (0.3 + Math.random() * 0.4)
        }

  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  const chain = scrollersOf(element)
  const regions = []
  for (let index = chain.length - 1; index >= 0; index--) {
    regions[index] = intersect(chain[index].getBoundingClientRect(), regions[index + 1] || viewport)
  }

  let goal = centreOf(element.getBoundingClientRect())
  let clipped = false
  for (let index = 0; index < chain.length; index++) {
    const rect = chain[index].getBoundingClientRect()
    if (contains(rect, goal)) continue
    const style = getComputedStyle(chain[index])
    if (/hidden|clip/.test(`${style.overflowX} ${style.overflowY}`) || isEmpty(rect)) return { programmatic: true }
    if (!isEmpty(regions[index])) return wheelToward(goal, regions[index], pointerIn(regions[index]))
    clipped = true
    goal = { x: rect.left + Math.min(rect.width / 2, innerWidth / 4), y: rect.top + Math.min(rect.height / 2, innerHeight / 4) }
  }
  if (contains(viewport, goal)) return clipped ? { programmatic: true } : null

  const capturesWheel = (node) => {
    for (let current = node; current && current !== pageRoot; current = parentOf(current)) {
      if (scrolls(current)) return true
    }
    return false
  }
  const candidates = [pointer, ...[0.5, 0.3, 0.7, 0.15, 0.85].flatMap((fx) => [0.5, 0.3, 0.7].map((fy) => ({ x: innerWidth * fx, y: innerHeight * fy })))]
  const free = candidates.find((point) => point && contains(viewport, point) && !capturesWheel(document.elementFromPoint(point.x, point.y)))
  if (!free) return { programmatic: true }
  return wheelToward(goal, viewport, free)
}

async function waitForStillTarget(target, deadline) {
  let last = await target.boundingBox({ timeout: remainingTime(deadline) })
  for (let checks = 0; checks < 16; checks++) {
    await sleep(Math.min(50, remainingTime(deadline) || Infinity))
    const next = await target.boundingBox({ timeout: remainingTime(deadline) })
    if (last && next && Math.abs(next.x - last.x) < 1 && Math.abs(next.y - last.y) < 1) return next
    last = next
  }
  return last
}

function createMoveHelpers(profile, viewport, requirePage) {
  const moveToPoint = async (currentPage, state, point, deadline) => {
    const size = await viewport(currentPage)
    const halfWidth = size.width / 2
    const halfHeight = size.height / 2
    const from = { x: state.x ?? halfWidth, y: state.y ?? halfHeight }
    const points = pathBetween(from, point, profile)
    const distance = Math.hypot(point.x - from.x, point.y - from.y)
    const duration = fittsDuration(distance, point.targetSize || 10, profile)
    let elapsed = 0
    await sequence(points, async (next, index) => {
      requirePage(currentPage)
      remainingTime(deadline)
      await currentPage.mouse.move(next.x, next.y)
      state.x = next.x
      state.y = next.y
      if (index + 1 >= points.length) {
        return
      }

      const { slice, eased } = computeEasing(duration, index, points.length, elapsed)
      elapsed = eased
      await sleep(Math.min(Math.max(4, slice * uniform(0.8, 1.2)), remainingTime(deadline) || Infinity))
    })
  }

  // Brings a locator into view with wheel input, as a person would. Falls back
  // to a programmatic scroll inside frames, when no point can scroll the page,
  // or when a wheel round does not move the target.
  const revealTarget = async (currentPage, state, target, timeout) => {
    if (!isLocatorTarget(target)) return
    const deadline = timeout ? performance.now() + timeout : timeout
    await validateTarget(target, currentPage, remainingTime(deadline))
    await target.waitFor({ state: 'visible', timeout: remainingTime(deadline) })
    for (let round = 0; round < REVEAL_ROUNDS; round++) {
      const pointer = state.x === undefined ? undefined : { x: state.x, y: state.y }
      const plan = await target.evaluate(planReveal, pointer, { timeout: remainingTime(deadline) })
      if (!plan) return
      if (plan.programmatic) break

      const before = await target.boundingBox({ timeout: remainingTime(deadline) })
      await moveToPoint(currentPage, state, { x: plan.x, y: plan.y, targetSize: 200 }, deadline)
      await performWheelSteps(
        currentPage,
        clamp(plan.dx, -REVEAL_STEP_LIMIT, REVEAL_STEP_LIMIT),
        clamp(plan.dy, -REVEAL_STEP_LIMIT, REVEAL_STEP_LIMIT),
        requirePage,
        deadline
      )
      const after = await waitForStillTarget(target, deadline)
      if (!before || !after || Math.hypot(after.x - before.x, after.y - before.y) < 2) break
      await sleep(Math.min(uniform(120, 320), remainingTime(deadline) || Infinity))
    }

    await target.scrollIntoViewIfNeeded({ timeout: remainingTime(deadline) })
  }

  const moveToTarget = async (currentPage, state, target) => {
    await revealTarget(currentPage, state, target)
    const box = await targetBox(target)
    await moveToPoint(currentPage, state, pointFor(box, profile))
  }

  return { moveToPoint, moveToTarget, revealTarget }
}

export { createMoveHelpers, pageViewport, performWheelSteps }
