<script setup>
import { computed, ref } from 'vue'
import { exportData, importData, state, summary, vendorTotals } from '../lib/store.js'
import { formatPLN } from '../lib/money.js'

const emit = defineEmits(['close', 'goto'])

const fileInput = ref(null)
const message = ref('')

const sums = computed(() => summary())

const rows = computed(() =>
  state.vendors
    .map((v, i) => ({ vendor: v, i, ...vendorTotals(v) }))
    .sort((a, b) => b.total - a.total || a.i - b.i),
)

const paidPercent = computed(() => {
  if (!sums.value.total) return 0
  return Math.min(100, Math.round((sums.value.deposit / sums.value.total) * 100))
})

const budgetPercent = computed(() => {
  if (!sums.value.hasBudget) return 0
  return Math.min(100, Math.round((sums.value.total / sums.value.budget) * 100))
})

function onExport() {
  const blob = new Blob([exportData()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `planer-slubny-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  flash('Kopia zapisana w plikach 💾')
}

async function onImport(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    importData(await file.text())
    flash('Dane wczytane ✓')
  } catch (err) {
    flash(`Nie udało się wczytać: ${err.message}`)
  }
  event.target.value = ''
}

let flashTimer = null
function flash(text) {
  message.value = text
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (message.value = ''), 3200)
}
</script>

<template>
  <section class="sum">
    <header class="sum__bar">
      <button class="sum__close" type="button" aria-label="Zamknij podsumowanie" @click="emit('close')">‹</button>
      <div class="sum__bar-title">Podsumowanie kosztów</div>
      <span class="sum__bar-spacer"></span>
    </header>

    <div class="sum__scroll">
      <div class="sum__hero">
        <span class="sum__hero-label">Razem koszty wesela</span>
        <strong class="sum__hero-value">{{ formatPLN(sums.total) }}</strong>
        <div class="ornament"><span>♥</span></div>

        <div class="sum__split">
          <div class="sum__split-item">
            <span>Wpłacone zaliczki</span>
            <strong class="is-good">{{ formatPLN(sums.deposit) }}</strong>
          </div>
          <div class="sum__split-sep"></div>
          <div class="sum__split-item">
            <span>Pozostało do zapłaty</span>
            <strong class="is-warn">{{ formatPLN(sums.left) }}</strong>
          </div>
        </div>

        <div class="bar" role="img" :aria-label="`Opłacone ${paidPercent} procent`">
          <div class="bar__fill" :style="{ width: `${paidPercent}%` }"></div>
        </div>
        <span class="sum__hero-note">Opłacone {{ paidPercent }}% całości · {{ sums.filled }} z {{ sums.count }} kartek z kwotą</span>
      </div>

      <div class="card">
        <label class="card__label" for="budget">Nasz budżet</label>
        <div class="card__budget">
          <input
            id="budget"
            v-model="state.budget"
            class="card__budget-input"
            inputmode="decimal"
            placeholder="np. 80 000"
          />
          <span class="card__budget-suffix">zł</span>
        </div>

        <template v-if="sums.hasBudget">
          <div class="bar bar--budget">
            <div
              class="bar__fill"
              :class="{ 'is-over': sums.diff < 0 }"
              :style="{ width: `${budgetPercent}%` }"
            ></div>
          </div>
          <p class="card__note" :class="sums.diff < 0 ? 'is-over' : 'is-good'">
            <template v-if="sums.diff >= 0">
              Zostaje jeszcze <strong>{{ formatPLN(sums.diff) }}</strong> w budżecie
            </template>
            <template v-else>
              Przekroczone o <strong>{{ formatPLN(Math.abs(sums.diff)) }}</strong>
            </template>
          </p>
        </template>
        <p v-else class="card__note">Wpisz budżet, żeby widzieć ile jeszcze zostało.</p>
      </div>

      <h2 class="sum__heading">Koszty po kartkach</h2>

      <ul class="rows">
        <li v-for="row in rows" :key="row.vendor.id">
          <button class="row" type="button" @click="emit('goto', row.i)">
            <span class="row__title">{{ row.vendor.title || 'Bez nazwy' }}</span>
            <span class="row__amount" :class="{ 'is-empty': !row.total }">
              {{ row.total ? formatPLN(row.total) : '—' }}
            </span>
            <span class="row__sub">
              {{ row.vendor.values.name || 'nie wybrano jeszcze' }}
              <template v-if="row.deposit > 0"> · zaliczka {{ formatPLN(row.deposit) }}</template>
            </span>
            <span class="row__chip">{{ row.vendor.values.status || 'Do ustalenia' }}</span>
          </button>
        </li>
      </ul>

      <div class="card card--backup">
        <span class="card__label">Kopia zapasowa</span>
        <p class="card__note">
          Dane są zapisane tylko w tym telefonie. Warto co jakiś czas zrobić kopię.
        </p>
        <div class="card__actions">
          <button class="btn btn--ghost" type="button" @click="onExport">Zapisz kopię</button>
          <button class="btn btn--ghost" type="button" @click="fileInput.click()">Wczytaj kopię</button>
        </div>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onImport" />
      </div>

      <p class="sum__foot">Iwona &amp; Mateusz ♥</p>
    </div>

    <Transition name="pop">
      <div v-if="message" class="toast">{{ message }}</div>
    </Transition>
  </section>
</template>

<style scoped>
.sum {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: var(--cream);
  background-image: radial-gradient(120% 55% at 50% 0%, #fffaf5 0%, rgba(255, 250, 245, 0) 60%);
}

.sum__bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(10px + var(--safe-top)) 14px 10px;
  border-bottom: 1px solid var(--paper-edge);
  background: rgba(251, 245, 239, 0.92);
  backdrop-filter: blur(10px);
}

.sum__close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--paper-edge);
  color: var(--blush);
  font-size: 24px;
  line-height: 1;
  padding-bottom: 3px;
}

.sum__bar-title {
  flex: 1;
  text-align: center;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
}

.sum__bar-spacer {
  width: 40px;
}

.sum__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 14px calc(28px + var(--safe-bottom));
}

.sum__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 18px 20px;
  border-radius: var(--radius);
  background: linear-gradient(170deg, #fffdfa 0%, #fdf4ee 100%);
  border: 1px solid var(--paper-edge);
  box-shadow: var(--shadow-page);
}

.sum__hero-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.sum__hero-value {
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
}

.sum__split {
  display: flex;
  align-items: stretch;
  width: 100%;
  margin-top: 6px;
}

.sum__split-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  text-align: center;
}

.sum__split-item span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.sum__split-item strong {
  font-family: var(--font-display);
  font-size: 21px;
}

.sum__split-sep {
  width: 1px;
  background: var(--paper-edge);
  margin: 2px 8px;
}

.is-good {
  color: #6f8a68;
}

.is-warn {
  color: var(--blush);
}

.is-over {
  color: var(--danger);
}

.bar {
  width: 100%;
  height: 7px;
  margin-top: 12px;
  border-radius: 999px;
  background: var(--cream-deep);
  overflow: hidden;
}

.bar__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--sage) 0%, #8fa88a 100%);
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.bar__fill.is-over {
  background: linear-gradient(90deg, var(--blush) 0%, var(--danger) 100%);
}

.bar--budget .bar__fill {
  background: linear-gradient(90deg, var(--gold-soft) 0%, var(--gold) 100%);
}

.sum__hero-note {
  font-size: 11px;
  color: var(--ink-faint);
  text-align: center;
}

.card {
  margin-top: 14px;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  box-shadow: 0 8px 20px -18px rgba(58, 51, 48, 0.7);
}

.card__label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.card__budget {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
}

.card__budget-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--ink);
  padding: 0;
}

.card__budget-input::placeholder {
  color: #d8ccc1;
}

.card__budget-suffix {
  font-size: 15px;
  font-weight: 700;
  color: var(--gold);
}

.card__note {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.45;
}

.card__actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.card__actions .btn {
  flex: 1;
}

.card--backup {
  margin-top: 22px;
  background: rgba(255, 255, 255, 0.6);
}

.sum__heading {
  margin: 26px 0 10px;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 700;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Tytuł i kwota w pierwszym wierszu, podtytuł i status w drugim — dzięki temu
   plakietka statusu nie zabiera miejsca nazwie usługodawcy. */
.row {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  column-gap: 10px;
  row-gap: 4px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  text-align: left;
  transition: transform 0.12s ease;
}

.row:active {
  transform: scale(0.985);
}

.row__title {
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row__sub {
  min-width: 0;
  font-size: 11.5px;
  color: var(--ink-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row__amount {
  justify-self: end;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
}

.row__amount.is-empty {
  color: var(--ink-faint);
  font-size: 15px;
}

.row__chip {
  justify-self: end;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--blush);
  background: var(--blush-wash);
  padding: 3px 7px;
  border-radius: 999px;
  white-space: nowrap;
}

.sum__foot {
  margin: 26px 0 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--ink-faint);
}

/* bez translateX — transition „pop" nadpisuje transform */
.toast {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: calc(24px + var(--safe-bottom));
  margin: 0 auto;
  width: fit-content;
  max-width: calc(100% - 32px);
  background: rgba(58, 51, 48, 0.94);
  color: #fff;
  padding: 11px 18px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  text-align: center;
  box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.9);
}
</style>
