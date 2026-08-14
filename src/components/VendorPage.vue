<script setup>
import { computed, ref } from 'vue'
import BrickField from './BrickField.vue'
import {
  FIELDS,
  EXTRA_FIELD_TYPES,
  addExtraField,
  removeExtraField,
  removeVendor,
  setExtraLabel,
  setExtraValue,
  setTitle,
  setValue,
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

const totals = computed(() => vendorTotals(props.vendor))
const showTypePicker = ref(false)
const confirmDelete = ref(false)

function onAddField(type) {
  showTypePicker.value = false
  addExtraField(props.vendor.id, 'Nowe pole', type)
}

function onDelete() {
  removeVendor(props.vendor.id)
  confirmDelete.value = false
}
</script>

<template>
  <article class="vpage" :class="{ 'is-inert': inert }">
    <div class="vpage__scroll">
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

      <section class="vpage__grid">
        <BrickField
          v-for="f in FIELDS"
          :key="f.key"
          :label="f.label"
          :type="f.type"
          :icon="f.icon"
          :span="f.span"
          :placeholder="f.placeholder || ''"
          :model-value="vendor.values[f.key]"
          @update:model-value="setValue(vendor.id, f.key, $event)"
        />

        <BrickField
          v-for="f in vendor.extra"
          :key="f.id"
          :label="f.label"
          :type="f.type"
          icon="✦"
          :span="f.type === 'textarea' ? 2 : 1"
          editable-label
          removable
          :model-value="f.value"
          @update:model-value="setExtraValue(vendor.id, f.id, $event)"
          @update:label="setExtraLabel(vendor.id, f.id, $event)"
          @remove="removeExtraField(vendor.id, f.id)"
        />
      </section>

      <div v-if="totals.total > 0" class="vpage__balance">
        <span>Pozostało do zapłaty</span>
        <strong>{{ formatPLN(totals.left) }}</strong>
      </div>

      <div class="vpage__tools">
        <button class="btn btn--ghost vpage__add" type="button" @click="showTypePicker = !showTypePicker">
          + Dodaj własne pole
        </button>

        <Transition name="pop">
          <div v-if="showTypePicker" class="vpage__types">
            <button v-for="t in EXTRA_FIELD_TYPES" :key="t.type" type="button" @click="onAddField(t.type)">
              {{ t.label }}
            </button>
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

.vpage__scroll {
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

.vpage__balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 13px 16px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--blush-wash) 0%, #fdf6f2 100%);
  border: 1px solid var(--blush-soft);
}

.vpage__balance span {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--blush);
}

.vpage__balance strong {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink);
}

.vpage__tools {
  margin-top: 14px;
}

.vpage__add {
  width: 100%;
}

.vpage__types {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
  transform-origin: top center;
}

.vpage__types button {
  padding: 9px 13px;
  border-radius: 999px;
  background: var(--sage-wash);
  border: 1px solid #dde5da;
  color: #5f7159;
  font-size: 13px;
  font-weight: 600;
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
