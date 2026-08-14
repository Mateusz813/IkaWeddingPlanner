<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import DateSheet from './DateSheet.vue'
import { STATUS_OPTIONS } from '../lib/store.js'
import { formatAmount, formatPLN, parseMoney } from '../lib/money.js'
import { formatDateShort } from '../lib/dates.js'

const props = defineProps({
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  modelValue: { type: String, default: '' },
  /** tylko dla transzy */
  due: { type: String, default: '' },
  paid: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  span: { type: Number, default: 1 },
  editableLabel: { type: Boolean, default: false },
  removable: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:label', 'update:due', 'update:paid', 'remove', 'grip'])

const textareaEl = ref(null)

/** Kafelek z treścią kasujemy dopiero za drugim stuknięciem — łatwo o pomyłkę. */
const confirmRemove = ref(false)
let confirmTimer = null

function onRemove() {
  if (!filled.value || confirmRemove.value) {
    clearTimeout(confirmTimer)
    emit('remove')
    return
  }
  confirmRemove.value = true
  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => (confirmRemove.value = false), 3000)
}

onBeforeUnmount(() => clearTimeout(confirmTimer))

/** Który termin edytujemy w kalendarzu: 'value' (pole daty) albo 'due' (transza). */
const picker = ref(null)

const pickerValue = computed(() => (picker.value === 'due' ? props.due : props.modelValue))
const pickerTitle = computed(() => (picker.value === 'due' ? `${props.label} — termin` : props.label))

function onPicked(iso) {
  emit(picker.value === 'due' ? 'update:due' : 'update:modelValue', iso)
}

const inputType = computed(() => {
  switch (props.type) {
    case 'tel':
      return 'tel'
    case 'email':
      return 'email'
    case 'url':
      return 'url'
    default:
      return 'text'
  }
})

const inputMode = computed(() => {
  switch (props.type) {
    case 'money':
    case 'installment':
      return 'decimal'
    case 'tel':
      return 'tel'
    case 'email':
      return 'email'
    case 'url':
      return 'url'
    default:
      return 'text'
  }
})

const filled = computed(() => String(props.modelValue || '').trim().length > 0)

/**
 * Podpowiedź pokazujemy tylko wtedy, gdy aplikacja odczytała kwotę inaczej niż
 * została wpisana (np. „7.200,50" albo „12.5") — wtedy warto ją potwierdzić.
 * Spacje pomijamy, bo Intl wstawia twardą spację, a użytkownik zwykłą.
 */
const stripSpaces = (s) => String(s).replace(/[\s  ]/g, '')

const moneyHint = computed(() => {
  if ((props.type !== 'money' && props.type !== 'installment') || !filled.value) return ''
  const n = parseMoney(props.modelValue)
  if (n <= 0) return ''
  const same = stripSpaces(formatAmount(n)) === stripSpaces(props.modelValue)
  return same ? '' : formatPLN(n)
})

const action = computed(() => {
  if (!filled.value) return null
  const raw = String(props.modelValue).trim()
  if (props.type === 'tel') return { href: `tel:${raw.replace(/[^\d+]/g, '')}`, icon: '📞', title: 'Zadzwoń' }
  if (props.type === 'email') return { href: `mailto:${raw}`, icon: '✉️', title: 'Napisz e-mail' }
  if (props.type === 'url') {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`
    return { href, icon: '↗', title: 'Otwórz', external: true }
  }
  return null
})

function autoGrow() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 420)}px`
}

watch(
  () => props.modelValue,
  () => {
    if (props.type === 'textarea') nextTick(autoGrow)
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="brick"
    :class="[`brick--span-${span}`, { 'is-filled': filled, 'brick--inst': type === 'installment', 'is-paid': type === 'installment' && paid }]"
  >
    <div class="brick__head">
      <button
        v-if="draggable"
        class="brick__grip"
        type="button"
        aria-label="Przytrzymaj i przesuń kafelek"
        @pointerdown="$emit('grip', $event)"
        @click.prevent
      >
        ⠿
      </button>

      <span class="brick__icon" aria-hidden="true">{{ icon }}</span>

      <input
        v-if="editableLabel"
        class="brick__label brick__label--input"
        :value="label"
        maxlength="40"
        aria-label="Nazwa pola"
        @input="$emit('update:label', $event.target.value)"
      />
      <span v-else class="brick__label">{{ label }}</span>

      <a
        v-if="action"
        class="brick__action"
        :href="action.href"
        :target="action.external ? '_blank' : null"
        :rel="action.external ? 'noopener noreferrer' : null"
        :title="action.title"
        :aria-label="action.title"
        >{{ action.icon }}</a
      >

      <button
        v-if="removable"
        class="brick__action brick__action--remove"
        :class="{ 'is-confirming': confirmRemove }"
        type="button"
        :aria-label="confirmRemove ? 'Potwierdź usunięcie pola' : 'Usuń pole'"
        @click="onRemove"
      >
        {{ confirmRemove ? '✓' : '×' }}
      </button>
    </div>

    <!-- transza: kwota + własny termin + znacznik zapłaty -->
    <template v-if="type === 'installment'">
      <div class="inst">
        <div class="inst__amount">
          <input
            class="brick__input brick__input--money"
            inputmode="decimal"
            :value="modelValue"
            placeholder="0"
            @input="$emit('update:modelValue', $event.target.value)"
          />
          <span class="brick__suffix">zł</span>
        </div>
        <button class="inst__due" type="button" @click="picker = 'due'">
          <span class="inst__due-label">termin</span>
          <span class="inst__due-value" :class="{ 'is-empty': !due }">
            {{ due ? formatDateShort(due) : 'wybierz' }}
          </span>
        </button>
      </div>
      <button class="inst__paid" type="button" @click="$emit('update:paid', !paid)">
        <span class="inst__box">{{ paid ? '✓' : '' }}</span>
        {{ paid ? 'Zapłacone' : 'Do zapłaty' }}
      </button>
    </template>

    <select
      v-else-if="type === 'status'"
      class="brick__input brick__input--select"
      :value="modelValue || STATUS_OPTIONS[0]"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-for="opt in STATUS_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
    </select>

    <textarea
      v-else-if="type === 'textarea'"
      ref="textareaEl"
      class="brick__input brick__input--area"
      rows="3"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', $event.target.value), autoGrow()"
    ></textarea>

    <button v-else-if="type === 'date'" class="datebtn" type="button" @click="picker = 'value'">
      <span class="datebtn__value" :class="{ 'is-empty': !modelValue }">
        {{ modelValue ? formatDateShort(modelValue) : 'wybierz datę' }}
      </span>
      <span class="datebtn__icon" aria-hidden="true">📅</span>
    </button>

    <div v-else class="brick__inputwrap">
      <input
        class="brick__input"
        :class="{ 'brick__input--money': type === 'money' }"
        :type="inputType"
        :inputmode="inputMode"
        :value="modelValue"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <span v-if="type === 'money'" class="brick__suffix">zł</span>
    </div>

    <span v-if="moneyHint" class="brick__hint">{{ moneyHint }}</span>

    <DateSheet
      v-if="picker"
      :model-value="pickerValue"
      :title="pickerTitle"
      @update:model-value="onPicked"
      @close="picker = null"
    />
  </div>
</template>

<style scoped>
.brick {
  position: relative;
  /* bez tego element gridu rozpycha się do szerokości treści */
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 13px 13px;
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(253, 248, 243, 0.92) 100%);
  border: 1px solid var(--paper-edge);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 4px 12px -10px rgba(58, 51, 48, 0.5);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.brick.is-filled {
  border-color: var(--gold-soft);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 6px 16px -12px rgba(200, 162, 74, 0.8);
}

.brick:focus-within {
  border-color: var(--blush);
  box-shadow: 0 0 0 3px rgba(240, 201, 194, 0.4);
}

.brick--span-2 {
  grid-column: 1 / -1;
}

.brick__head {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 20px;
}

/* W wąskiej kolumnie nagłówek ma ~125px na uchwyt, ikonę, etykietę i „×".
   Ikona jest tu najmniej potrzebna — bez niej etykiety mieszczą się w jednej linii. */
.brick--span-1 .brick__icon {
  display: none;
}

.brick__grip {
  flex: none;
  margin: -6px 0 -6px -5px;
  padding: 6px 3px;
  color: #cdbfb2;
  font-size: 13px;
  line-height: 1;
  letter-spacing: -1px;
  /* przeciąganie nie może uruchamiać przewijania ani przewracania kartki */
  touch-action: none;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.brick__icon {
  font-size: 12px;
  line-height: 1;
  opacity: 0.85;
}

.brick__label {
  flex: 1;
  min-width: 0;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-transform: uppercase;
  color: var(--ink-faint);
  overflow-wrap: anywhere;
}

.brick--span-2 .brick__label {
  font-size: 10px;
  letter-spacing: 0.06em;
}

/**
 * Etykieta ma wyglądać na ~10px, ale pole poniżej 16px każe iOS przybliżyć widok.
 * Dlatego czcionka ma 16px, a zmniejszamy ją skalowaniem; szerokość i prawy
 * margines kompensują skalę, żeby pole zajmowało tyle miejsca co wcześniej.
 * Selektor musi mieć taką samą specyficzność jak `.brick--span-2 .brick__label`,
 * inaczej tamta reguła nadpisze rozmiar czcionki.
 */
.brick .brick__label--input {
  --label-scale: 0.594; /* 16px × 0.594 ≈ 9,5px — tyle co etykiety stałe */
  border: 0;
  background: transparent;
  padding: 0;
  min-width: 0;
  width: calc(100% / var(--label-scale));
  margin-right: calc((1 / var(--label-scale) - 1) * -100%);
  transform: scale(var(--label-scale));
  transform-origin: left center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--blush);
  outline: none;
}

.brick--span-2 .brick__label--input {
  --label-scale: 0.625; /* 16px × 0.625 = 10px */
}

.brick__action {
  flex: none;
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  margin: -4px -3px -4px 0;
  border-radius: 50%;
  background: var(--blush-wash);
  color: var(--blush);
  font-size: 12px;
  text-decoration: none;
}

.brick__action--remove {
  background: transparent;
  color: #cdbfb2;
  font-size: 18px;
  line-height: 1;
}

.brick__action--remove.is-confirming {
  background: rgba(180, 84, 75, 0.12);
  color: var(--danger);
  font-size: 12px;
}

.brick__inputwrap {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.brick__input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  outline: none;
  color: var(--ink);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.35;
  min-height: 22px;
}

/* pole daty otwiera własny kalendarz — natywnego popupu nie da się ostylować */
.datebtn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 22px;
  text-align: left;
}

.datebtn__value {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.datebtn__value.is-empty {
  font-weight: 400;
  color: #cbbfb4;
}

.datebtn__icon {
  flex: none;
  font-size: 13px;
  opacity: 0.7;
}

.brick__input::placeholder {
  color: #cbbfb4;
  font-weight: 400;
}

.brick__input--money {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.brick__suffix {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--gold);
}

.brick__input--select {
  appearance: none;
  -webkit-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--ink-faint) 50%),
    linear-gradient(135deg, var(--ink-faint) 50%, transparent 50%);
  background-position: right 6px center, right 1px center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 18px;
}

.brick__input--area {
  resize: none;
  overflow: hidden;
  line-height: 1.5;
  min-height: 62px;
}

.brick__hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--gold);
  letter-spacing: 0.02em;
}

/* ---------- transza ---------- */

.brick--inst {
  background: linear-gradient(180deg, #fffdfa 0%, #fdf5ef 100%);
}

.brick--inst.is-paid {
  border-color: #c3d2bd;
  background: linear-gradient(180deg, #fbfdfa 0%, #f2f6f0 100%);
}

.inst {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.inst__amount {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.inst__due {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 5px 11px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid var(--paper-edge);
  text-align: left;
}

.inst__due:active {
  background: var(--blush-wash);
}

.inst__due-label {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.inst__due-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.inst__due-value.is-empty {
  font-weight: 500;
  color: #cbbfb4;
}

.inst__paid {
  display: flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  margin-top: 2px;
  padding: 5px 11px 5px 6px;
  border-radius: 999px;
  background: var(--blush-wash);
  color: var(--blush);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.is-paid .inst__paid {
  background: var(--sage-wash);
  color: #5f7159;
}

.inst__box {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 5px;
  background: #fff;
  border: 1px solid currentColor;
  font-size: 11px;
  line-height: 1;
}
</style>
