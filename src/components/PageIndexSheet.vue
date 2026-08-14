<script setup>
import { ref } from 'vue'
import { moveVendor, state, value, vendorTotals } from '../lib/store.js'
import { useDragSort } from '../lib/dragSort.js'
import { formatPLN } from '../lib/money.js'

const emit = defineEmits(['close', 'goto', 'add'])

const listEl = ref(null)

const { drag, renderList, ghostStyle, start } = useDragSort({
  items: () => state.vendors,
  scrollEl: listEl,
  containerEl: listEl,
  itemSelector: '.idx__row',
  onDrop: (from, to) => moveVendor(from, to),
})

/** Numer kartki liczymy z aktualnego układu, bo w trakcie przeciągania się zmienia. */
function numer(vendor) {
  return state.vendors.findIndex((v) => v.id === vendor.id) + 1
}
</script>

<template>
  <div class="idx" @click.self="emit('close')">
    <div class="idx__panel">
      <div class="idx__grip" @click="emit('close')"></div>
      <h2 class="idx__title">Spis kartek</h2>
      <p class="idx__hint">Przeciągnij za ⠿, żeby zmienić kolejność</p>

      <div ref="listEl" class="idx__list">
        <template v-for="entry in renderList">
          <div v-if="entry.kind === 'gap'" key="gap" class="drag-gap" :style="{ height: `${drag.h}px` }"></div>

          <div
            v-else
            :key="entry.item.id"
            class="idx__row"
            :class="{ 'is-current': entry.item.id === state.vendors[state.index]?.id, 'is-floating': entry.floating }"
            :style="entry.floating ? ghostStyle : null"
          >
            <button
              class="idx__drag"
              type="button"
              aria-label="Przytrzymaj i przesuń kartkę"
              @pointerdown="start($event, entry.item)"
              @click.prevent
            >
              ⠿
            </button>

            <button class="idx__item" type="button" @click="emit('goto', numer(entry.item) - 1)">
              <span class="idx__num">{{ numer(entry.item) }}</span>
              <span class="idx__text">
                <span class="idx__name">{{ entry.item.title || 'Bez nazwy' }}</span>
                <span class="idx__sub">{{ value(entry.item, 'name') || '—' }}</span>
              </span>
              <span class="idx__amount">
                {{ vendorTotals(entry.item).total ? formatPLN(vendorTotals(entry.item).total) : '' }}
              </span>
            </button>
          </div>
        </template>
      </div>

      <button class="btn btn--primary idx__add" type="button" @click="emit('add')">+ Dodaj nową kartkę</button>
    </div>
  </div>
</template>

<style scoped>
.idx {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  background: rgba(58, 51, 48, 0.35);
  backdrop-filter: blur(3px);
}

.idx__panel {
  width: 100%;
  max-height: 82%;
  display: flex;
  flex-direction: column;
  padding: 8px 14px calc(16px + var(--safe-bottom));
  border-radius: 24px 24px 0 0;
  background: var(--cream);
  box-shadow: 0 -14px 40px -18px rgba(58, 51, 48, 0.8);
  animation: rise 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes rise {
  from {
    transform: translateY(30px);
    opacity: 0.5;
  }
}

.idx__grip {
  flex: none;
  width: 44px;
  height: 5px;
  margin: 4px auto 10px;
  border-radius: 999px;
  background: var(--paper-edge);
}

.idx__title {
  flex: none;
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
}

.idx__hint {
  flex: none;
  margin: 2px 0 12px;
  text-align: center;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.idx__list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 0 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.idx__row {
  /* bez tego pozycje ściskają się zamiast przewijać */
  flex: none;
  display: flex;
  align-items: stretch;
  border-radius: var(--radius-sm);
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  overflow: hidden;
}

.idx__row.is-current {
  border-color: var(--blush);
  background: var(--blush-wash);
}

.idx__row.is-floating {
  position: absolute;
  z-index: 40;
  pointer-events: none;
  transform: rotate(-1deg) scale(1.02);
  box-shadow: 0 18px 32px -14px rgba(58, 51, 48, 0.65);
  border-color: var(--blush);
}

.drag-gap {
  flex: none;
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--blush-soft);
  background: rgba(240, 201, 194, 0.14);
}

.idx__drag {
  flex: none;
  width: 34px;
  display: grid;
  place-items: center;
  color: #cdbfb2;
  font-size: 15px;
  letter-spacing: -1px;
  border-right: 1px solid var(--paper-edge);
  /* przeciąganie nie może przewijać listy */
  touch-action: none;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.idx__item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  text-align: left;
}

.idx__num {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--cream-deep);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
}

.is-current .idx__num {
  background: var(--blush);
  color: #fff;
}

.idx__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.idx__name {
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.idx__sub {
  font-size: 11px;
  color: var(--ink-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.idx__amount {
  flex: none;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-soft);
}

.idx__add {
  flex: none;
  width: 100%;
  margin-top: 12px;
}
</style>
