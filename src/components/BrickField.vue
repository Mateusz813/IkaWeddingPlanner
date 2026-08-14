<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { STATUS_OPTIONS } from '../lib/store.js'
import { formatAmount, formatPLN, parseMoney } from '../lib/money.js'

const props = defineProps({
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  modelValue: { type: String, default: '' },
  icon: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  span: { type: Number, default: 1 },
  editableLabel: { type: Boolean, default: false },
  removable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:label', 'remove'])

const textareaEl = ref(null)

const inputType = computed(() => {
  switch (props.type) {
    case 'date':
      return 'date'
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
const stripSpaces = (s) => String(s).replace(/[\s  ]/g, '')

const moneyHint = computed(() => {
  if (props.type !== 'money' || !filled.value) return ''
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

function onInput(event) {
  emit('update:modelValue', event.target.value)
  if (props.type === 'textarea') autoGrow()
}
</script>

<template>
  <div class="brick" :class="[`brick--span-${span}`, { 'is-filled': filled }]">
    <div class="brick__head">
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
        type="button"
        aria-label="Usuń pole"
        @click="$emit('remove')"
      >
        ×
      </button>
    </div>

    <select
      v-if="type === 'status'"
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
      @input="onInput"
    ></textarea>

    <div v-else class="brick__inputwrap">
      <input
        class="brick__input"
        :class="{ 'brick__input--money': type === 'money' }"
        :type="inputType"
        :inputmode="inputMode"
        :value="modelValue"
        :placeholder="placeholder"
        @input="onInput"
      />
      <span v-if="type === 'money'" class="brick__suffix">zł</span>
    </div>

    <span v-if="moneyHint" class="brick__hint">{{ moneyHint }}</span>
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
  gap: 6px;
  min-height: 20px;
}

.brick__icon {
  font-size: 12px;
  line-height: 1;
  opacity: 0.85;
}

.brick__label {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.25;
  text-transform: uppercase;
  color: var(--ink-faint);
  overflow-wrap: anywhere;
}

.brick__label--input {
  border: 0;
  background: transparent;
  padding: 0;
  width: 100%;
  min-width: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--blush);
  outline: none;
}

.brick__action {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: -4px -4px -4px 0;
  border-radius: 50%;
  background: var(--blush-wash);
  color: var(--blush);
  font-size: 13px;
  text-decoration: none;
}

.brick__action--remove {
  background: transparent;
  color: var(--ink-faint);
  font-size: 20px;
  line-height: 1;
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

/* natywne pole daty jest szerokie — zmniejszamy, żeby zmieściło się w kolumnie */
.brick__input[type='date'] {
  font-size: 14px;
  font-weight: 600;
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
</style>
