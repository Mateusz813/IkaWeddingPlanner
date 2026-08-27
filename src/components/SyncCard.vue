<script setup>
import { computed, ref } from 'vue'
import { connect, disconnect, pull, push, sync, test } from '../lib/sheets.js'

const urlInput = ref(sync.url)
const tokenInput = ref(sync.token)
const message = ref('')
const confirmPull = ref(false)

const canConnect = computed(() => urlInput.value.trim().length > 20 && tokenInput.value.trim().length > 0)

const ostatnioZapisano = computed(() => (sync.lastPushAt ? czas(sync.lastPushAt) : ''))
const ostatnioWczytano = computed(() => (sync.lastPullAt ? czas(sync.lastPullAt) : ''))

function czas(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function onConnect() {
  connect(urlInput.value, tokenInput.value)
  const wynik = await test()
  if (wynik.ok) flash(wynik.kartek ? `Połączono ✓ w arkuszu jest ${wynik.kartek} kartek` : 'Połączono ✓ arkusz jest pusty')
}

async function onPush() {
  const wynik = await push()
  if (wynik) flash(`Zapisano do arkusza ✓ ${wynik.kartki} kartek`)
}

async function onPull() {
  confirmPull.value = false
  const wynik = await pull()
  if (wynik) flash(`Wczytano z arkusza ✓ ${wynik.kartki} kartek`)
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
        Podaj adres skryptu i hasło, żeby zapisywać dane do arkusza.
      </p>
      <label class="sync__field">
        <span>Adres skryptu (kończy się na /exec)</span>
        <input v-model="urlInput" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" />
      </label>
      <label class="sync__field">
        <span>Hasło ze skryptu (TOKEN)</span>
        <input v-model="tokenInput" type="text" placeholder="to samo, co w Kod.gs" />
      </label>
      <button class="btn btn--primary sync__wide" type="button" :disabled="!canConnect || !!sync.busy" @click="onConnect">
        Połącz z arkuszem
      </button>
    </template>

    <template v-else>
      <p class="card__note">
        Nic nie dzieje się samo. Zapis i odczyt tylko po naciśnięciu przycisku.
      </p>

      <button class="btn btn--primary sync__wide sync__save" type="button" :disabled="!!sync.busy" @click="onPush">
        {{ sync.busy === 'push' ? 'Zapisuję…' : 'Zapisz do Google Sheets' }}
      </button>

      <button class="btn btn--ghost sync__wide" type="button" :disabled="!!sync.busy" @click="confirmPull = true">
        {{ sync.busy === 'pull' ? 'Wczytuję…' : 'Wczytaj z Google Sheets' }}
      </button>

      <Transition name="pop">
        <div v-if="confirmPull" class="sync__confirm">
          <strong>Wczytać dane z arkusza?</strong>
          <span>
            To <u>zastąpi wszystko</u>, co jest teraz w tym telefonie — kartki, kwoty, notatki i kolejność.
            Jeśli masz tu coś nowego, najpierw zapisz.
          </span>
          <div class="sync__confirm-row">
            <button class="btn btn--ghost" type="button" @click="confirmPull = false">Anuluj</button>
            <button class="btn btn--danger" type="button" @click="onPull">Tak, zastąp</button>
          </div>
        </div>
      </Transition>

      <p v-if="sync.error" class="sync__error">{{ sync.error }}</p>

      <p v-else-if="sync.unsaved" class="sync__hint is-warn">
        Masz zmiany, których nie ma jeszcze w arkuszu.
      </p>

      <dl class="sync__log">
        <div><dt>Ostatni zapis</dt><dd>{{ ostatnioZapisano || '—' }}</dd></div>
        <div><dt>Ostatni odczyt</dt><dd>{{ ostatnioWczytano || '—' }}</dd></div>
      </dl>

      <button v-if="!sync.auto" class="sync__off" type="button" @click="onDisconnect">Rozłącz arkusz</button>
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

.sync__wide {
  width: 100%;
  margin-top: 10px;
}

.sync__wide:disabled {
  opacity: 0.55;
}

.sync__save {
  min-height: 52px;
  font-size: 16px;
}

.sync__error {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(180, 84, 75, 0.08);
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--danger);
}

.sync__hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  text-align: center;
}

.sync__hint.is-warn {
  color: var(--gold);
}

.sync__log {
  display: flex;
  gap: 10px;
  margin: 14px 0 0;
}

.sync__log > div {
  flex: 1;
  text-align: center;
  padding: 8px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--paper-edge);
}

.sync__log dt {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.sync__log dd {
  margin: 3px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-soft);
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
