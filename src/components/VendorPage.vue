<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import BrickField from './BrickField.vue'
import {
  EXTRA_FIELD_TYPES,
  FIELD_DEFS,
  addBlock,
  blockMeta,
  missingKeys,
  moveBlock,
  removeBlock,
  removeVendor,
  restoreKey,
  setBlockDue,
  setBlockLabel,
  setBlockPaid,
  setBlockValue,
  setTitle,
  vendorTotals,
} from '../lib/store.js'
import { formatPLN } from '../lib/money.js'

const props = defineProps({
  vendor: { type: Object, required: true },
  position: { type: Number, required: true },
  count: { type: Number, required: true },
  /** Kartka w trakcie przewracania jest tylko obrazkiem — bez interakcji. */
  inert: { type: Boolean, default: false },
})

const scrollEl = ref(null)
const gridEl = ref(null)
const showAdd = ref(false)
const confirmDelete = ref(false)

const totals = computed(() => vendorTotals(props.vendor))
const canRestore = computed(() => missingKeys(props.vendor))

/* ---------------- przeciąganie kafelków ---------------- */

/** null albo { blockId, index, span, w, h, grabX, grabY, x, y } — `index` to
 *  pozycja pustego miejsca w liście bez przeciąganego kafelka. */
const drag = ref(null)

/**
 * Przeciągany kafelek zostaje na swoim miejscu w liście (żeby przeglądarka nie
 * przeniosła węzła i nie zgubiła przechwyconego wskaźnika) — jest tylko wyjęty
 * z układu przez position:absolute. Puste miejsce wstawiamy obok.
 */
const renderList = computed(() => {
  const blocks = props.vendor.blocks
  if (!drag.value) return blocks.map((block) => ({ kind: 'block', block, floating: false }))

  const list = []
  let restIdx = 0
  for (const block of blocks) {
    if (block.id === drag.value.blockId) {
      list.push({ kind: 'block', block, floating: true })
      continue
    }
    if (restIdx === drag.value.index) list.push({ kind: 'gap' })
    list.push({ kind: 'block', block, floating: false })
    restIdx += 1
  }
  if (drag.value.index >= restIdx) list.push({ kind: 'gap' })
  return list
})

const ghostStyle = computed(() => {
  const d = drag.value
  if (!d) return null
  return { left: `${d.x}px`, top: `${d.y}px`, width: `${d.w}px`, height: `${d.h}px` }
})

let autoScrollTimer = null
let pointer = { x: 0, y: 0 }

function onGrip(event, block) {
  if (props.inert || drag.value) return
  event.preventDefault()
  event.stopPropagation()

  const brickEl = event.target.closest('.brick')
  const scroller = scrollEl.value
  if (!brickEl || !scroller) return

  const rect = brickEl.getBoundingClientRect()
  const scRect = scroller.getBoundingClientRect()

  drag.value = {
    blockId: block.id,
    index: props.vendor.blocks.findIndex((b) => b.id === block.id),
    span: blockMeta(block).span,
    w: rect.width,
    h: rect.height,
    grabX: event.clientX - rect.left,
    grabY: event.clientY - rect.top,
    x: rect.left - scRect.left + scroller.scrollLeft,
    y: rect.top - scRect.top + scroller.scrollTop,
  }

  pointer = { x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragCancel)
  autoScrollTimer = setInterval(autoScroll, 16)

  // Przechwycenie wskaźnika omija trafianie w elementy, więc zdarzenia docierają
  // nawet gdy przeciągany kafelek ma pointer-events: none. Gdyby się nie udało,
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

function onDragMove(event) {
  if (!drag.value) return
  event.preventDefault()
  pointer = { x: event.clientX, y: event.clientY }
  placeGhost()
  updateGap()
}

/**
 * Puste miejsce wskakuje na pozycję kafelka pod palcem. Kierunek wynika z tego,
 * czy ten kafelek jest przed czy za obecnym pustym miejscem — dzięki temu nic
 * nie „drga" na granicy.
 */
function updateGap() {
  const grid = gridEl.value
  if (!grid || !drag.value) return

  const nodes = [...grid.children].filter((n) => !n.classList.contains('is-floating'))
  let restIdx = 0

  for (const node of nodes) {
    if (node.classList.contains('brick-gap')) continue
    const r = node.getBoundingClientRect()
    if (pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom) {
      drag.value.index = restIdx < drag.value.index ? restIdx : restIdx + 1
      return
    }
    restIdx += 1
  }
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

function stopDrag() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragCancel)
  clearInterval(autoScrollTimer)
  autoScrollTimer = null
}

function onDragEnd() {
  const d = drag.value
  stopDrag()
  drag.value = null
  if (!d) return
  const from = props.vendor.blocks.findIndex((b) => b.id === d.blockId)
  if (from !== -1) moveBlock(props.vendor.id, from, d.index)
}

/** System przejął gest — kafelek wraca tam, skąd go wzięliśmy. */
function onDragCancel() {
  stopDrag()
  drag.value = null
}

onBeforeUnmount(stopDrag)

/* ---------------- dodawanie i usuwanie ---------------- */

function onAdd(type) {
  showAdd.value = false
  addBlock(props.vendor.id, type)
}

function onRestore(key) {
  showAdd.value = false
  restoreKey(props.vendor.id, key)
}

function onDelete() {
  removeVendor(props.vendor.id)
  confirmDelete.value = false
}
</script>

<template>
  <article class="vpage" :class="{ 'is-inert': inert, 'is-dragging': !!drag }">
    <div ref="scrollEl" class="vpage__scroll">
      <header class="vpage__head">
        <div class="vpage__meta">Kartka {{ position + 1 }} z {{ count }}</div>
        <input
          class="vpage__title"
          :value="vendor.title"
          placeholder="Nazwa kartki"
          maxlength="42"
          aria-label="Nazwa kartki"
          @input="setTitle(vendor.id, $event.target.value)"
        />
        <div class="ornament"><span>♥</span></div>
      </header>

      <section ref="gridEl" class="vpage__grid">
        <template v-for="item in renderList">
          <div
            v-if="item.kind === 'gap'"
            key="gap"
            class="brick-gap"
            :class="`brick--span-${drag.span}`"
            :style="{ minHeight: `${drag.h}px` }"
          ></div>

          <BrickField
            v-else
            :key="item.block.id"
            v-bind="blockMeta(item.block)"
            class="brick-item"
            :class="{ 'is-floating': item.floating }"
            :style="item.floating ? ghostStyle : null"
            :model-value="item.block.value"
            :due="item.block.due || ''"
            :paid="!!item.block.paid"
            :removable="true"
            :draggable="!inert"
            @update:model-value="setBlockValue(vendor.id, item.block.id, $event)"
            @update:label="setBlockLabel(vendor.id, item.block.id, $event)"
            @update:due="setBlockDue(vendor.id, item.block.id, $event)"
            @update:paid="setBlockPaid(vendor.id, item.block.id, $event)"
            @remove="removeBlock(vendor.id, item.block.id)"
            @grip="onGrip($event, item.block)"
          />
        </template>
      </section>

      <div v-if="totals.total > 0" class="vpage__balance">
        <div class="vpage__balance-row">
          <div class="vpage__balance-item">
            <span>Zapłacone</span>
            <strong class="is-good">{{ formatPLN(totals.paid) }}</strong>
          </div>
          <div class="vpage__balance-sep"></div>
          <div class="vpage__balance-item">
            <span>Pozostało</span>
            <strong>{{ formatPLN(totals.left) }}</strong>
          </div>
        </div>

        <p class="vpage__balance-note">
          Razem <strong>{{ formatPLN(totals.total) }}</strong>
          <template v-if="totals.extraCount">
            = {{ formatPLN(totals.base) }} + {{ totals.extraCount }}
            {{ totals.extraCount === 1 ? 'dodatkowy koszt' : 'dodatkowe koszty' }} {{ formatPLN(totals.extra) }}
          </template>
        </p>

        <p v-if="totals.count" class="vpage__balance-note">
          {{ totals.count }} {{ totals.count === 1 ? 'transza' : 'transze' }} · rozpisane
          {{ formatPLN(totals.planned) }}<template v-if="totals.deposit > 0"> + zaliczka {{ formatPLN(totals.deposit) }}</template>
        </p>

        <p v-if="totals.overplanned" class="vpage__balance-warn">
          Zaliczka i transze dają więcej niż kwota pełna ({{ formatPLN(totals.stated) }}) — sprawdź kwoty.
        </p>
      </div>

      <div class="vpage__tools">
        <button class="btn btn--ghost vpage__add" type="button" @click="showAdd = !showAdd">
          + Dodaj kafelek
        </button>

        <Transition name="pop">
          <div v-if="showAdd" class="adder">
            <button class="adder__hero" type="button" @click="onAdd('installment')">
              <span class="adder__hero-icon">💸</span>
              <span class="adder__hero-text">
                <strong>Transza / rata</strong>
                <small>kwota + własny termin + znacznik zapłaty</small>
              </span>
            </button>

            <div class="adder__label">Własne pole</div>
            <div class="adder__chips">
              <button
                v-for="t in EXTRA_FIELD_TYPES.filter((x) => x.type !== 'installment')"
                :key="t.type"
                type="button"
                @click="onAdd(t.type)"
              >
                {{ t.label }}
              </button>
            </div>

            <template v-if="canRestore.length">
              <div class="adder__label">Przywróć pole</div>
              <div class="adder__chips adder__chips--restore">
                <button v-for="k in canRestore" :key="k" type="button" @click="onRestore(k)">
                  {{ FIELD_DEFS[k].label }}
                </button>
              </div>
            </template>
          </div>
        </Transition>
      </div>

      <footer class="vpage__foot">
        <button v-if="!confirmDelete" class="vpage__del" type="button" @click="confirmDelete = true">
          Usuń tę kartkę
        </button>
        <div v-else class="vpage__confirm">
          <span>Na pewno usunąć „{{ vendor.title || 'tę kartkę' }}”?</span>
          <div class="vpage__confirm-row">
            <button class="btn btn--ghost" type="button" @click="confirmDelete = false">Nie</button>
            <button class="btn btn--danger" type="button" @click="onDelete">Tak, usuń</button>
          </div>
        </div>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.vpage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--radius);
  background: var(--paper);
  background-image:
    linear-gradient(90deg, rgba(200, 162, 74, 0.16) 0px, rgba(200, 162, 74, 0) 12px),
    radial-gradient(90% 55% at 50% 0%, #fffefc 0%, rgba(255, 254, 252, 0) 70%);
}

.vpage.is-inert {
  pointer-events: none;
}

.vpage.is-dragging {
  user-select: none;
  -webkit-user-select: none;
}

.vpage__scroll {
  position: relative;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 20px 16px 30px 20px;
}

.vpage__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.vpage__meta {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.vpage__title {
  width: 100%;
  border: 0;
  background: transparent;
  outline: none;
  text-align: center;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--ink);
  padding: 2px 0;
}

.vpage__title::placeholder {
  color: #d8ccc1;
}

.ornament span {
  font-size: 11px;
}

.vpage__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

/* przeciągany kafelek — wyjęty z układu, leci za palcem */
.vpage__grid :deep(.brick.is-floating) {
  position: absolute;
  z-index: 40;
  pointer-events: none;
  transform: rotate(-1.2deg) scale(1.03);
  box-shadow: 0 18px 32px -14px rgba(58, 51, 48, 0.65);
  border-color: var(--blush);
  opacity: 0.97;
}

.brick-gap {
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--blush-soft);
  background: rgba(240, 201, 194, 0.14);
}

.vpage__balance {
  margin-top: 14px;
  padding: 13px 16px 14px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--blush-wash) 0%, #fdf6f2 100%);
  border: 1px solid var(--blush-soft);
}

.vpage__balance-row {
  display: flex;
  align-items: stretch;
}

.vpage__balance-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.vpage__balance-item span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--blush);
}

.vpage__balance-item strong {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink);
}

.vpage__balance-item .is-good {
  color: #6f8a68;
}

.vpage__balance-sep {
  width: 1px;
  margin: 2px 10px;
  background: var(--blush-soft);
}

.vpage__balance-note {
  margin: 10px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--ink-soft);
}

.vpage__balance-warn {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--danger);
  line-height: 1.4;
}

.vpage__tools {
  margin-top: 14px;
}

.vpage__add {
  width: 100%;
}

.adder {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--paper-edge);
  transform-origin: top center;
}

.adder__hero {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fdf0ea 0%, #fbe6de 100%);
  border: 1px solid var(--blush-soft);
  text-align: left;
}

.adder__hero-icon {
  font-size: 20px;
}

.adder__hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.adder__hero-text strong {
  font-size: 14.5px;
  color: var(--ink);
}

.adder__hero-text small {
  font-size: 11px;
  color: var(--ink-soft);
}

.adder__label {
  margin: 13px 0 7px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.adder__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.adder__chips button {
  padding: 8px 13px;
  border-radius: 999px;
  background: var(--sage-wash);
  border: 1px solid #dde5da;
  color: #5f7159;
  font-size: 13px;
  font-weight: 600;
}

.adder__chips--restore button {
  background: #f6f1ea;
  border-color: var(--paper-edge);
  color: var(--ink-soft);
}

.vpage__foot {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--paper-edge);
  text-align: center;
}

.vpage__del {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-faint);
  padding: 8px 14px;
}

.vpage__confirm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  font-size: 14px;
  color: var(--ink-soft);
}

.vpage__confirm-row {
  display: flex;
  gap: 10px;
}
</style>
