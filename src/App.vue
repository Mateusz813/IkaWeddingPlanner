<script setup>
import { computed, nextTick, ref } from 'vue'
import BookView from './components/BookView.vue'
import SummaryView from './components/SummaryView.vue'
import PageIndexSheet from './components/PageIndexSheet.vue'
import { addVendor, state, summary } from './lib/store.js'
import { formatPLN } from './lib/money.js'
import { updating } from './lib/updater.js'

const book = ref(null)
const showSummary = ref(false)
const showIndex = ref(false)

const total = computed(() => summary().total)

function addPage() {
  showIndex.value = false
  const pos = addVendor('Nowy usługodawca', state.index)
  nextTick(() => book.value?.goTo(pos))
}

function jumpTo(i) {
  showIndex.value = false
  showSummary.value = false
  nextTick(() => book.value?.goTo(i))
}
</script>

<template>
  <div class="app">
    <header class="top">
      <button class="top__icon" type="button" aria-label="Dodaj nową kartkę" @click="addPage">+</button>

      <div class="top__brand">
        <span class="top__mono">I <em>&amp;</em> M</span>
        <span class="top__sub">planer ślubny</span>
      </div>

      <button class="top__sum" type="button" @click="showSummary = true">
        <span class="top__sum-label">Podsumowanie</span>
        <span class="top__sum-value">{{ formatPLN(total) }}</span>
      </button>
    </header>

    <BookView ref="book" @open-index="showIndex = true" />

    <Transition name="sheet">
      <SummaryView v-if="showSummary" @close="showSummary = false" @goto="jumpTo" />
    </Transition>

    <Transition name="fade">
      <PageIndexSheet v-if="showIndex" @close="showIndex = false" @goto="jumpTo" @add="addPage" />
    </Transition>

    <Transition name="pop">
      <div v-if="updating" class="updating">Aktualizuję aplikację…</div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  overflow: hidden;
}

@supports not (height: 100dvh) {
  .app {
    height: 100vh;
    max-height: 100vh;
  }
}

.top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(8px + var(--safe-top)) 12px 8px;
}

.top__icon {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--paper-edge);
  color: var(--blush);
  font-size: 24px;
  font-weight: 300;
  line-height: 1;
  padding-bottom: 3px;
  box-shadow: 0 6px 14px -10px rgba(58, 51, 48, 0.8);
  transition: transform 0.12s ease;
}

.top__icon:active {
  transform: scale(0.92);
}

.top__brand {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.top__mono {
  font-family: var(--font-display);
  font-size: 23px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
}

.top__mono em {
  font-style: italic;
  color: var(--blush);
}

.top__sub {
  margin-top: 3px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.top__sum {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-height: 42px;
  padding: 5px 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--blush) 0%, #c97f76 100%);
  color: #fff;
  box-shadow: 0 8px 18px -9px rgba(201, 127, 118, 0.95);
  transition: transform 0.12s ease;
}

.top__sum:active {
  transform: scale(0.95);
}

.top__sum-label {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.85;
}

.top__sum-value {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.updating {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: calc(24px + var(--safe-bottom));
  z-index: 60;
  margin: 0 auto;
  width: fit-content;
  background: rgba(58, 51, 48, 0.94);
  color: #fff;
  padding: 11px 18px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.9);
}
</style>
