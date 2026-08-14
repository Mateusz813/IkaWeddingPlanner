<script setup>
import { computed, ref } from 'vue'
import { connect, disconnect, pull, push, sync, test } from '../lib/sheets.js'
import { state } from '../lib/store.js'

const urlInput = ref(sync.url)
const tokenInput = ref(sync.token)
const message = ref('')
const confirmPull = ref(false)

const canConnect = computed(() => urlInput.value.trim().length > 20 && tokenInput.value.trim().length > 0)

const statusText = computed(() => {
  if (sync.busy === 'push') return 'Wysyłam…'
  if (sync.busy === 'pull') return 'Pobieram…'
  if (sync.busy === 'test') return 'Sprawdzam…'
  if (sync.error) return 'Coś nie zadziałało'
  if (sync.pending) return 'Czeka na wysłanie'
  if (sync.lastPushAt) return `Wysłano ${czas(sync.lastPushAt)}`
  return 'Połączono'
})

function czas(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

async function onConnect() {
  connect(urlInput.value, tokenInput.value)
  const wynik = await test()
  if (wynik.ok) {
    flash(`Połączono ✓ w arkuszu jest ${wynik.wierszy} wierszy`)
    await push()
  }
}

async function onPush() {
  await push()
  if (!sync.error) flash('Wysłano do arkusza ✓')
}

async function onPull() {
  confirmPull.value = false
  const wynik = await pull()
  if (wynik) flash(`Pobrano ${wynik.kartki} kartek z arkusza ✓`)
}

function onDisconnect() {
  disconnect()
  urlInput.value = ''
  tokenInput.value = ''
  flash('Rozłączono — dane zostają w telefonie')
}

let flashTimer = null
function flash(text) {
  message.value = text
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (message.value = ''), 4000)
}
</script>

<template>
  <div class="card sync">
    <span class="card__label">Google Sheets</span>

    <template v-if="!sync.connected">
      <p class="card__note">
        Arkusz staje się bazą danych: po każdej zmianie aplikacja sama go nadpisuje.
        W drugą stronę dane idą <strong>tylko na Twoje kliknięcie</strong>.
      </p>
      <label class="sync__field">
        <span>Adres skryptu (kończy się na /exec)</span>
        <input v-model="urlInput" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" />
      </label>
      <label class="sync__field">
        <span>Hasło ze skryptu (TOKEN)</span>
        <input v-model="tokenInput" type="text" placeholder="to samo, co w Kod.gs" />
      </label>
      <button class="btn btn--primary sync__connect" type="button" :disabled="!canConnect || !!sync.busy" @click="onConnect">
        Połącz z arkuszem
      </button>
    </template>

    <template v-else>
      <div class="sync__status" :class="{ 'is-error': !!sync.error, 'is-pending': sync.pending && !sync.error }">
        <span class="sync__dot"></span>
        {{ statusText }}
      </div>

      <p v-if="sync.error" class="sync__error">{{ sync.error }}</p>

      <div class="card__actions">
        <button class="btn btn--ghost" type="button" :disabled="!!sync.busy" @click="onPush">Wyślij teraz</button>
        <button class="btn btn--ghost" type="button" :disabled="!!sync.busy" @click="confirmPull = true">
          Pobierz z arkusza
        </button>
      </div>

      <Transition name="pop">
        <div v-if="confirmPull" class="sync__confirm">
          <strong>Pobrać dane z arkusza?</strong>
          <span>
            To <u>zastąpi wszystko</u>, co jest teraz w tym telefonie — wszystkie kartki, kwoty i notatki.
            Zmian z telefonu nie da się potem odzyskać.
          </span>
          <div class="sync__confirm-row">
            <button class="btn btn--ghost" type="button" @click="confirmPull = false">Anuluj</button>
            <button class="btn btn--danger" type="button" @click="onPull">Tak, zastąp</button>
          </div>
        </div>
      </Transition>

      <button class="sync__off" type="button" @click="onDisconnect">Rozłącz arkusz</button>
    </template>

    <Transition name="fade">
      <p v-if="message" class="sync__msg">{{ message }}</p>
    </Transition>
  </div>
</template>

<style scoped>
.sync {
  margin-top: 22px;
}

.sync__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}

.sync__field span {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-soft);
}

.sync__field input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--paper-edge);
  background: var(--paper);
  outline: none;
  /* 16px — inaczej iOS przybliża widok po wejściu w pole */
  font-size: 16px;
}

.sync__field input:focus {
  border-color: var(--blush);
  box-shadow: 0 0 0 3px rgba(240, 201, 194, 0.4);
}

.sync__connect {
  width: 100%;
  margin-top: 14px;
}

.sync__connect:disabled {
  opacity: 0.5;
}

.sync__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #6f8a68;
}

.sync__status.is-pending {
  color: var(--gold);
}

.sync__status.is-error {
  color: var(--danger);
}

.sync__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.sync__error {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--danger);
}

.sync__confirm {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding: 14px;
  border-radius: var(--radius-sm);
  background: rgba(180, 84, 75, 0.07);
  border: 1px solid rgba(180, 84, 75, 0.25);
  transform-origin: top center;
}

.sync__confirm strong {
  font-size: 14.5px;
  color: var(--danger);
}

.sync__confirm span {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.sync__confirm-row {
  display: flex;
  gap: 10px;
}

.sync__confirm-row .btn {
  flex: 1;
}

.sync__off {
  display: block;
  margin: 14px auto 0;
  padding: 6px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-faint);
}

.sync__msg {
  margin: 12px 0 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--sage-wash);
  font-size: 12.5px;
  font-weight: 600;
  color: #5f7159;
  text-align: center;
}
</style>
