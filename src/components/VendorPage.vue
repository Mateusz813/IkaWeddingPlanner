<script setup>
import { computed, ref } from 'vue'
import BrickField from './BrickField.vue'
import { useDragSort } from '../lib/dragSort.js'
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

const { drag, renderList, ghostStyle, start } = useDragSort({
  items: () => props.vendor.blocks,
  scrollEl,
  containerEl: gridEl,
  itemSelector: '.brick',
  onDrop: (from, to) => moveBlock(props.vendor.id, from, to),
})

function onGrip(event, block) {
  if (props.inert) return
  start(event, block)
}

const gapSpan = computed(() => (drag.value ? blockMeta(props.vendor.blocks.find((b) => b.id === drag.value.id) || {}).span : 1))

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
        <template v-for="entry in renderList">
          <div
            v-if="entry.kind === 'gap'"
            key="gap"
            class="drag-gap"
            :class="`brick--span-${gapSpan}`"
            :style="{ minHeight: `${drag.h}px` }"
          ></div>

          <BrickField
            v-else
            :key="entry.item.id"
            v-bind="blockMeta(entry.item)"
            :class="{ 'is-floating': entry.floating }"
            :style="entry.floating ? ghostStyle : null"
            :model-value="entry.item.value"
            :due="entry.item.due || ''"
            :paid="!!entry.item.paid"
            :removable="true"
            :draggable="!inert"
            @update:model-value="setBlockValue(vendor.id, entry.item.id, $event)"
            @update:label="setBlockLabel(vendor.id, entry.item.id, $event)"
            @update:due="setBlockDue(vendor.id, entry.item.id, $event)"
            @update:paid="setBlockPaid(vendor.id, entry.item.id, $event)"
            @remove="removeBlock(vendor.id, entry.item.id)"
            @grip="onGrip($event, entry.item)"
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

.drag-gap {
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
