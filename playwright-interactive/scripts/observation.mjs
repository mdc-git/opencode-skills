// Returns the lines of an AI ARIA snapshot that match a case-insensitive
// pattern, each preceded by its ancestor lines, so a large tree can be
// searched without returning it whole.
export function ariaFind(tree, pattern, max = 40) {
  const lines = tree.split('\n')
  const match = new RegExp(pattern, 'i')
  const keep = new Set()

  lines.forEach((line, index) => {
    if (!match.test(line)) return
    keep.add(index)
    let indent = line.search(/\S/)
    for (let previous = index - 1; previous >= 0 && indent > 0; previous--) {
      const previousIndent = lines[previous].search(/\S/)
      if (previousIndent < indent) {
        keep.add(previous)
        indent = previousIndent
      }
    }
  })

  const found = [...keep].sort((a, b) => a - b).map((index) => lines[index])
  if (found.length <= max) return found.join('\n')
  return `${found.slice(0, max).join('\n')}\n… ${found.length - max} more lines: narrow the pattern or the scope`
}

// Hit-tests the centre of every visible control in the viewport, including
// controls in open shadow roots. Groups covered controls by the outermost
// element that sits on top of them, and counts controls that hit nothing,
// which happens when a modal makes the rest of the page inert.
export function findOverlays(page) {
  return page.evaluate(() => {
    const parentOf = (node) => node.assignedSlot || node.parentElement || node.getRootNode().host
    const contains = (outer, inner) => {
      for (let node = inner; node; node = parentOf(node)) if (node === outer) return true
      return false
    }
    const deepest = (x, y) => {
      let hit = document.elementFromPoint(x, y)
      while (hit?.shadowRoot) {
        const inner = hit.shadowRoot.elementFromPoint(x, y)
        if (!inner || inner === hit) break
        hit = inner
      }
      return hit
    }
    const controls = []
    const collect = (root) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.matches('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [tabindex]:not([tabindex="-1"])')) controls.push(element)
        if (element.shadowRoot) collect(element.shadowRoot)
      }
    }
    collect(document)

    const overlays = new Map()
    let checked = 0
    let unreachable = 0
    for (const control of controls) {
      const box = control.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      if (box.width < 2 || box.height < 2 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
      if (getComputedStyle(control).visibility !== 'visible') continue
      checked++
      const hit = deepest(x, y)
      if (hit && contains(control, hit)) continue
      if (!hit || hit === document.body || hit === document.documentElement) { unreachable++; continue }
      let layer = hit
      while (parentOf(layer) && !contains(parentOf(layer), control)) layer = parentOf(layer)
      if (contains(layer, control)) continue
      overlays.set(layer, (overlays.get(layer) || 0) + 1)
    }

    const cssPath = (element) => {
      const parts = []
      for (let node = element; node && node !== document.body; node = node.parentElement || node.getRootNode().host) {
        if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break }
        const siblings = node.parentElement ? node.parentElement.children : node.getRootNode().children
        parts.unshift(`${node.localName}:nth-child(${[...siblings].indexOf(node) + 1})`)
      }
      return parts.join(' > ')
    }
    return {
      checked,
      unreachable,
      overlays: [...overlays].sort((a, b) => b[1] - a[1]).map(([element, covers]) => ({
        covers,
        locator: cssPath(element),
        role: element.getAttribute('role') || element.localName,
        label: (element.getAttribute('aria-label') || element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70)
      }))
    }
  })
}

// Waits until the document stops adding, removing or changing content for
// quietMs, instead of a fixed sleep. Pages that never stop changing return
// timedOut: true after timeout.
export async function settle(page, { quietMs = 500, timeout = 5000 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    await page.waitForLoadState('domcontentloaded')
    try {
      return await page.evaluate(({ quietMs, remaining }) => new Promise((resolve) => {
        const start = performance.now()
        let quiet
        const finish = (timedOut) => {
          observer.disconnect()
          clearTimeout(quiet)
          clearTimeout(limit)
          resolve({ ms: Math.round(performance.now() - start), timedOut })
        }
        const observer = new MutationObserver(() => {
          clearTimeout(quiet)
          quiet = setTimeout(() => finish(false), quietMs)
        })
        observer.observe(document, { subtree: true, childList: true, characterData: true })
        quiet = setTimeout(() => finish(false), quietMs)
        const limit = setTimeout(() => finish(true), remaining)
      }), { quietMs, remaining: Math.max(0, deadline - Date.now()) })
    } catch (error) {
      // A navigation during the wait replaces the document; wait on the new one.
      if (Date.now() >= deadline || !/context was destroyed|navigat/i.test(error.message)) throw error
    }
  }
}

// One compact view of the current state: location, open tabs, child frames,
// controls covered by overlays and a depth-limited AI snapshot outline.
export async function observe(page, { depth = 3 } = {}) {
  return {
    url: page.url(),
    title: await page.title(),
    tabs: page.context().pages().map((candidate) => candidate.url()),
    frames: page.frames().slice(1).map((frame) => frame.url()).filter((url) => url && url !== 'about:blank').slice(0, 10),
    overlays: await findOverlays(page),
    outline: await page.ariaSnapshot({ mode: 'ai', depth, timeout: 10000 })
  }
}
