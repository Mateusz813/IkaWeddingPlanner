import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * Przeciąganie elementów listy palcem, wspólne dla kafelków i kartek.
 *
 * Przeciągany element ZOSTAJE na swoim miejscu w liście — jest tylko wyjęty
 * z układu przez position:absolute. Przeniesienie węzła w DOM gubi przechwycony
 * wskaźnik i przeciąganie urywa się po pierwszym ruchu.
 *
 * `index` w stanie przeciągania to pozycja pustego miejsca liczona w liście BEZ
 * przenoszonego elementu — tak samo, jak przyjmują to moveBlock i moveVendor.
 */
export function useDragSort({ items, scrollEl, containerEl, itemSelector, onDrop, idOf = (item) => item.id }) {
  const drag = ref(null)

  let autoScrollTimer = null
  let pointer = { x: 0, y: 0 }

  const renderList = computed(() => {
    const list = items()
    if (!drag.value) return list.map((item) => ({ kind: 'item', item, floating: false }))

    const out = []
    let restIdx = 0
    for (const item of list) {
      if (idOf(item) === drag.value.id) {
        out.push({ kind: 'item', item, floating: true })
        continue
      }
      if (restIdx === drag.value.index) out.push({ kind: 'gap' })
      out.push({ kind: 'item', item, floating: false })
      restIdx += 1
    }
    if (drag.value.index >= restIdx) out.push({ kind: 'gap' })
    return out
  })

  const ghostStyle = computed(() => {
    const d = drag.value
    if (!d) return null
    return { left: `${d.x}px`, top: `${d.y}px`, width: `${d.w}px`, height: `${d.h}px` }
  })

  function start(event, item) {
    if (drag.value) return
    event.preventDefault()
    event.stopPropagation()

    const element = event.target.closest(itemSelector)
    const scroller = scrollEl.value
    if (!element || !scroller) return

    const rect = element.getBoundingClientRect()
    const scRect = scroller.getBoundingClientRect()
    const id = idOf(item)

    drag.value = {
      id,
      index: items().findIndex((x) => idOf(x) === id),
      w: rect.width,
      h: rect.height,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      x: rect.left - scRect.left + scroller.scrollLeft,
      y: rect.top - scRect.top + scroller.scrollTop,
    }

    pointer = { x: event.clientX, y: event.clientY }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    autoScrollTimer = setInterval(autoScroll, 16)

    // Przechwycenie wskaźnika omija trafianie w elementy, więc zdarzenia docierają
    // nawet gdy przeciągany element ma pointer-events: none. Gdyby się nie udało,
    // przeciąganie i tak działa na nasłuchu na window — nie wolno tu wybuchnąć.
    try {
      event.target.setPointerCapture?.(event.pointerId)
    } catch {
      /* nieaktywny wskaźnik */
    }
    navigator.vibrate?.(8)
  }

  function placeGhost() {
    const scroller = scrollEl.value
    if (!drag.value || !scroller) return
    const scRect = scroller.getBoundingClientRect()
    drag.value.x = pointer.x - drag.value.grabX - scRect.left + scroller.scrollLeft
    drag.value.y = pointer.y - drag.value.grabY - scRect.top + scroller.scrollTop
  }

  /**
   * Puste miejsce wskakuje na pozycję elementu pod palcem. Kierunek wynika z tego,
   * czy ten element jest przed czy za obecnym pustym miejscem — dzięki temu nic
   * nie „drga" na granicy.
   */
  function updateGap() {
    const container = containerEl.value
    if (!container || !drag.value) return

    const nodes = [...container.children].filter((n) => !n.classList.contains('is-floating'))
    let restIdx = 0

    for (const node of nodes) {
      if (node.classList.contains('drag-gap')) continue
      const r = node.getBoundingClientRect()
      if (pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom) {
        drag.value.index = restIdx < drag.value.index ? restIdx : restIdx + 1
        return
      }
      restIdx += 1
    }
  }

  function onMove(event) {
    if (!drag.value) return
    event.preventDefault()
    pointer = { x: event.clientX, y: event.clientY }
    placeGhost()
    updateGap()
  }

  function autoScroll() {
    const scroller = scrollEl.value
    if (!drag.value || !scroller) return

    const rect = scroller.getBoundingClientRect()
    const zone = 64
    let dy = 0
    if (pointer.y < rect.top + zone) dy = -Math.ceil((rect.top + zone - pointer.y) / 5)
    else if (pointer.y > rect.bottom - zone) dy = Math.ceil((pointer.y - (rect.bottom - zone)) / 5)
    if (!dy) return

    const before = scroller.scrollTop
    scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight, before + dy))
    if (scroller.scrollTop === before) return
    placeGhost()
    updateGap()
  }

  function stop() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    clearInterval(autoScrollTimer)
    autoScrollTimer = null
  }

  function onUp() {
    const d = drag.value
    stop()
    drag.value = null
    if (!d) return
    const from = items().findIndex((x) => idOf(x) === d.id)
    if (from !== -1) onDrop(from, d.index)
  }

  /** System przejął gest — element wraca tam, skąd go wzięliśmy. */
  function onCancel() {
    stop()
    drag.value = null
  }

  onBeforeUnmount(stop)

  return { drag, renderList, ghostStyle, start }
}
