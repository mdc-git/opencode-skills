async function validateTarget(target, currentPage, timeout) {
  if (target.page() !== currentPage) {
    throw new Error('The target locator belongs to a different Playwright page')
  }

  if (!(await target.isEnabled({ timeout }))) {
    throw new Error('The target locator is disabled')
  }
}

function isLocatorTarget(target) {
  return typeof target?.boundingBox === 'function'
}

function isCoordinateTarget(target) {
  return Number.isFinite(target?.x) && Number.isFinite(target?.y)
}

async function locatorTargetBox(target, timeout) {
  const box = await target.boundingBox({ timeout })
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('Humanized input target is not visible')
  }

  return box
}

async function targetBox(target, timeout) {
  if (isLocatorTarget(target)) {
    return locatorTargetBox(target, timeout)
  }

  if (isCoordinateTarget(target)) {
    return { x: target.x, y: target.y, width: 1, height: 1 }
  }

  throw new TypeError('Humanized input target must be a Locator or { x, y }')
}

// Returns the first candidate offset where the target is the topmost element,
// or a description of the outermost element covering the target's centre.
async function hitTestCandidates(target, candidates) {
  return target.evaluate((element, points) => {
    const root = element.getRootNode()
    const hitTestRoot = typeof root.elementFromPoint === 'function' ? root : element.ownerDocument
    const rect = element.getBoundingClientRect()
    const labels = element.labels ? [...element.labels] : []
    const topAt = (point) => hitTestRoot.elementFromPoint(rect.left + rect.width * point.x, rect.top + rect.height * point.y)
    const offset = points.find((candidate) => {
      const top = topAt(candidate)
      return (
        top === element ||
        element.contains(top) ||
        labels.some((label) => top === label || label.contains(top))
      )
    })
    if (offset) return { offset }

    let cover = topAt({ x: 0.5, y: 0.5 })
    if (!cover) return { coveredBy: 'nothing hit-testable; the page may be inert behind a modal' }
    while (cover.parentElement && !cover.parentElement.contains(element)) cover = cover.parentElement
    const role = cover.getAttribute('role')
    const label = (cover.getAttribute('aria-label') || cover.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60)
    return { coveredBy: `<${cover.localName}${cover.id ? `#${cover.id}` : ''}${role ? ` role=${role}` : ''}> "${label}"` }
  }, candidates)
}

async function scrollToAlignment(target, alignment) {
  await target.evaluate(
    (element, block) => element.scrollIntoView({ behavior: 'instant', block, inline: 'nearest' }),
    alignment
  )
}

async function findHitPoint(target, hitTest) {
  let result = await hitTest()
  if (result.offset) {
    return result
  }

  await scrollToAlignment(target, 'start')
  result = await hitTest()
  if (result.offset) {
    return result
  }

  await scrollToAlignment(target, 'end')
  return hitTest()
}

async function clickablePoint(target, point, box) {
  const preferred = {
    x: Math.min(1, Math.max(0, (point.x - box.x) / box.width)),
    y: Math.min(1, Math.max(0, (point.y - box.y) / box.height))
  }
  const candidates = [
    preferred,
    { x: 0.5, y: 0.5 },
    { x: 0.25, y: 0.5 },
    { x: 0.75, y: 0.5 },
    { x: 0.5, y: 0.25 },
    { x: 0.5, y: 0.75 }
  ]
  const hitTest = () => hitTestCandidates(target, candidates)
  const { offset, coveredBy } = await findHitPoint(target, hitTest)
  if (!offset) {
    throw new Error(`Humanized input target is obscured by ${coveredBy}`)
  }

  const refreshedBox = await target.boundingBox()
  if (!refreshedBox) {
    throw new Error('Humanized input target is no longer visible after hit testing')
  }

  const offsetX = refreshedBox.width * offset.x
  const offsetY = refreshedBox.height * offset.y
  return {
    x: refreshedBox.x + offsetX,
    y: refreshedBox.y + offsetY,
    targetSize: Math.max(refreshedBox.width, refreshedBox.height)
  }
}

export { clickablePoint, isLocatorTarget, targetBox, validateTarget }
