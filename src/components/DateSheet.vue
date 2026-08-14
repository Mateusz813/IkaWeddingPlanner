<script setup>
import { computed, ref } from 'vue'
import { isoToday, parseISO, toISO } from '../lib/dates.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  title: { type: String, default: 'Wybierz datę' },
})

const emit = defineEmits(['update:modelValue', 'close'])

const WEEKDAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd']
const MONTHS = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
]

const todayIso = isoToday()
const selectedIso = computed(() => (parseISO(props.modelValue) ? props.modelValue : ''))

const start = parseISO(props.modelValue) || parseISO(todayIso)
const cursor = ref({ year: start.getFullYear(), month: start.getMonth() })

const monthLabel = computed(() => MONTHS[cursor.value.month])

const grid = computed(() => {
  const { year, month } = cursor.value
  // poniedziałek pierwszy: getDay() daje 0 dla niedzieli
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - offset + i)
    cells.push({
      iso: toISO(d),
      day: d.getDate(),
      outside: d.getMonth() !== month,
      weekend: i % 7 >= 5,
    })
  }
  // szósty tydzień pokazujemy tylko wtedy, gdy należy do tego miesiąca
  return cells[35].outside ? cells.slice(0, 35) : cells
})

function shiftMonth(step) {
  const next = new Date(cursor.value.year, cursor.value.month + step, 1)
  cursor.value = { year: next.getFullYear(), month: next.getMonth() }
}

function shiftYear(step) {
  cursor.value = { year: cursor.value.year + step, month: cursor.value.month }
}

function pick(iso) {
  emit('update:modelValue', iso)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="cal" @click.self="emit('close')">
      <div class="cal__sheet" role="dialog" aria-modal="true" :aria-label="title">
        <div class="cal__grip" @click="emit('close')"></div>
        <h2 class="cal__title">{{ title }}</h2>

        <div class="cal__nav">
          <div class="cal__stepper">
            <button type="button" aria-label="Poprzedni miesiąc" @click="shiftMonth(-1)">‹</button>
            <span class="cal__stepper-value">{{ monthLabel }}</span>
            <button type="button" aria-label="Następny miesiąc" @click="shiftMonth(1)">›</button>
          </div>
          <div class="cal__stepper cal__stepper--year">
            <button type="button" aria-label="Poprzedni rok" @click="shiftYear(-1)">‹</button>
            <span class="cal__stepper-value">{{ cursor.year }}</span>
            <button type="button" aria-label="Następny rok" @click="shiftYear(1)">›</button>
          </div>
        </div>

        <div class="cal__week">
          <span v-for="d in WEEKDAYS" :key="d">{{ d }}</span>
        </div>

        <div class="cal__days">
          <button
            v-for="cell in grid"
            :key="cell.iso"
            type="button"
            class="cal__day"
            :class="{
              'is-outside': cell.outside,
              'is-weekend': cell.weekend,
              'is-today': cell.iso === todayIso,
              'is-selected': cell.iso === selectedIso,
            }"
            @click="pick(cell.iso)"
          >
            {{ cell.day }}
          </button>
        </div>

        <div class="cal__foot">
          <button class="btn btn--ghost" type="button" @click="pick('')">Wyczyść</button>
          <button class="btn btn--primary" type="button" @click="pick(todayIso)">Dziś</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(58, 51, 48, 0.42);
  backdrop-filter: blur(3px);
  animation: cal-fade 0.2s ease;
}

@keyframes cal-fade {
  from {
    opacity: 0;
  }
}

.cal__sheet {
  width: 100%;
  max-width: 480px;
  padding: 8px 16px calc(18px + var(--safe-bottom));
  border-radius: 24px 24px 0 0;
  background: var(--cream);
  background-image: radial-gradient(120% 60% at 50% 0%, #fffaf5 0%, rgba(255, 250, 245, 0) 60%);
  box-shadow: 0 -14px 40px -18px rgba(58, 51, 48, 0.8);
  animation: cal-rise 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes cal-rise {
  from {
    transform: translateY(28px);
    opacity: 0.5;
  }
}

.cal__grip {
  width: 44px;
  height: 5px;
  margin: 4px auto 10px;
  border-radius: 999px;
  background: var(--paper-edge);
}

.cal__title {
  margin: 0 0 14px;
  text-align: center;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 700;
  color: var(--ink);
}

.cal__nav {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.cal__stepper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
}

.cal__stepper--year {
  flex: 0 0 42%;
}

.cal__stepper button {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--blush);
  font-size: 22px;
  line-height: 1;
  padding-bottom: 3px;
}

.cal__stepper button:active {
  background: var(--blush-wash);
}

.cal__stepper-value {
  flex: 1;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  text-transform: capitalize;
}

.cal__week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 4px;
}

.cal__week span {
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.cal__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cal__day {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--paper);
  border: 1px solid transparent;
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
  transition: transform 0.1s ease, background 0.15s ease;
}

.cal__day:active {
  transform: scale(0.92);
}

.cal__day.is-weekend {
  color: var(--blush);
}

.cal__day.is-outside {
  background: transparent;
  color: #cfc3b8;
  font-weight: 500;
}

.cal__day.is-today {
  border-color: var(--gold-soft);
  color: var(--gold);
}

.cal__day.is-selected {
  background: linear-gradient(135deg, var(--blush) 0%, #c97f76 100%);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 6px 14px -8px rgba(201, 127, 118, 0.95);
}

.cal__foot {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.cal__foot .btn {
  flex: 1;
}

@media (prefers-reduced-motion: reduce) {
  .cal,
  .cal__sheet {
    animation: none;
  }
}
</style>
