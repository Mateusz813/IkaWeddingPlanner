<script setup>
import { computed } from 'vue'
import { moveVendor, state, value, vendorTotals } from '../lib/store.js'
import { formatPLN } from '../lib/money.js'

const emit = defineEmits(['close', 'goto', 'add'])

const pages = computed(() =>
  state.vendors.map((v, i) => ({ vendor: v, i, ...vendorTotals(v) })),
)
</script>

<template>
  <div class="idx" @click.self="emit('close')">
    <div class="idx__panel">
      <div class="idx__grip" @click="emit('close')"></div>
      <h2 class="idx__title">Spis kartek</h2>

      <ul class="idx__list">
        <li v-for="p in pages" :key="p.vendor.id" :class="{ 'is-current': p.i === state.index }">
          <button class="idx__item" type="button" @click="emit('goto', p.i)">
            <span class="idx__num">{{ p.i + 1 }}</span>
            <span class="idx__text">
              <span class="idx__name">{{ p.vendor.title || 'Bez nazwy' }}</span>
              <span class="idx__sub">{{ value(p.vendor, 'name') || '—' }}</span>
            </span>
            <span class="idx__amount">{{ p.total ? formatPLN(p.total) : '' }}</span>
          </button>
          <span class="idx__move">
            <button type="button" aria-label="W górę" :disabled="p.i === 0" @click="moveVendor(p.i, p.i - 1)">↑</button>
            <button
              type="button"
              aria-label="W dół"
              :disabled="p.i === pages.length - 1"
              @click="moveVendor(p.i, p.i + 1)"
            >
              ↓
            </button>
          </span>
        </li>
      </ul>

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
  margin: 0 0 12px;
  text-align: center;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
}

.idx__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  margin: 0;
  padding: 0 0 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.idx__list li {
  /* bez tego pozycje ściskają się zamiast przewijać */
  flex: none;
  display: flex;
  align-items: stretch;
  gap: 6px;
  border-radius: var(--radius-sm);
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  overflow: hidden;
}

.idx__list li.is-current {
  border-color: var(--blush);
  background: var(--blush-wash);
}

.idx__item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 4px 11px 12px;
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

.idx__move {
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--paper-edge);
}

.idx__move button {
  flex: 1;
  width: 38px;
  color: var(--ink-faint);
  font-size: 13px;
}

.idx__move button:disabled {
  opacity: 0.25;
}

.idx__add {
  flex: none;
  width: 100%;
  margin-top: 12px;
}
</style>
