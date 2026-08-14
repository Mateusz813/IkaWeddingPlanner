<script setup>
import { computed, ref } from 'vue'
import { connect, disconnect, pull, push, sync, test } from '../lib/sheets.js'

const urlInput = ref(sync.url)
const tokenInput = ref(sync.token)
const message = ref('')
const confirmPull = ref(false)
const confirmPush = ref(false)
/** Co zastaliśmy w arkuszu przy łączeniu: null albo { wierszy, kartek }. */
const remote = ref(null)

const canConnect = computed(() => urlInput.value.trim().length > 20 && tokenInput.value.trim().length > 0)

/**
 * Zaraz po połączeniu nie wysyłamy nic sami — drugi telefon nadpisałby wtedy
 * pracę pierwszego, zanim zdążyłby ją pobrać. Kierunek wybiera użytkownik.
 */
const firstRun = computed(() => sync.connected && !sync.auto && !sync.lastPushAt && !sync.lastPullAt)

const statusText = computed(() => {
  if (sync.busy === 'push') return 'Wysyłam…'
  if (sync.busy === 'pull') return 'Pobieram…'
  if (sync.busy === 'test') return 'Sprawdzam…'
  if (sync.error) return 'Coś nie zadziałało'
  if (firstRun.value) return 'Połączono — wybierz kierunek'
  if (sync.pending) return 'Czeka na wysłanie'
  const ostatnie = [sync.lastPushAt, sync.lastPullAt].filter(Boolean).sort().pop()
  if (ostatnie) return `Zsynchronizowano ${czas(ostatnie)}`
  return sync.auto ? 'Synchronizacja włączona' : 'Połączono'
})

function czas(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

async function onConnect() {
  connect(urlInput.value, tokenInput.value)
  const wynik = await test()
  if (!wynik.ok) return
  remote.value = wynik
  flash(wynik.kartek ? `Połączono ✓ w arkuszu jest ${wynik.kartek} kartek` : 'Połączono ✓ arkusz jest pusty')
}

async function onPush() {
  confirmPush.value = false
  await push()
  if (!sync.error) flash('Wysłano do arkusza ✓')
}

/** Oba potwierdzenia wykluczają się — inaczej potrafiły wyskoczyć naraz. */
function askPush() {
  confirmPull.value = false
  // pusty arkusz nie ma czego stracić — pytamy tylko, gdy coś tam jest
  if (firstRun.value && remote.value?.kartek) confirmPush.value = true
  else onPush()
}

function askPull() {
  confirmPush.value = false
  confirmPull.value = true
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
  remote.value = null
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
      <div class="sync__status" :class="{ 'is-error': !!sync.error, 'is-pending': (sync.pending || firstRun) && !sync.error }">
        <span class="sync__dot"></span>
        {{ statusText }}
      </div>

      <p v-if="sync.error" class="sync__error">{{ sync.error }}</p>

      <!-- Pierwsza synchronizacja: nic nie dzieje się samo, kierunek wybiera użytkownik -->
      <div v-if="firstRun" class="sync__first">
        <p class="sync__first-info">
          <template v-if="remote?.kartek">
            W arkuszu są już dane — <strong>{{ remote.kartek }} kartek</strong>. Zdecyduj, która wersja jest ważniejsza.
          </template>
          <template v-else-if="remote"> Arkusz jest pusty. Wyślij do niego to, co masz w telefonie. </template>
          <template v-else> Wybierz, w którą stronę mają pójść dane. </template>
        </p>
        <div class="card__actions">
          <button class="btn btn--primary" type="button" :disabled="!!sync.busy" @click="askPush">
            Wyślij moje dane
          </button>
          <button class="btn btn--ghost" type="button" :disabled="!!sync.busy" @click="askPull">
            Pobierz z arkusza
          </button>
        </div>
      </div>

      <!-- Przy konfiguracji z Vercela nie ma czego klikać: wysyłka i pobieranie
           dzieją się same. Przycisk pokazujemy tylko, gdy coś nie zadziałało. -->
      <button
        v-else-if="sync.auto"
        v-show="sync.error || sync.pending"
        class="btn btn--ghost sync__retry"
        type="button"
        :disabled="!!sync.busy"
        @click="onPush"
      >
        Spróbuj wysłać ponownie
      </button>

      <div v-else class="card__actions">
        <button class="btn btn--ghost" type="button" :disabled="!!sync.busy" @click="onPush">Wyślij teraz</button>
        <button class="btn btn--ghost" type="button" :disabled="!!sync.busy" @click="askPull">
          Pobierz z arkusza
        </button>
      </div>

      <Transition name="pop">
        <div v-if="confirmPush" class="sync__confirm sync__confirm--push">
          <strong>Nadpisać arkusz?</strong>
          <span>
            W arkuszu jest {{ remote?.kartek }} kartek — zostaną <u>zastąpione</u> tym, co masz w tym telefonie.
            Jeśli to praca kogoś innego, najpierw ją pobierz.
          </span>
          <div class="sync__confirm-row">
            <button class="btn btn--ghost" type="button" @click="confirmPush = false">Anuluj</button>
            <button class="btn btn--danger" type="button" @click="onPush">Tak, nadpisz</button>
          </div>
        </div>
      </Transition>

      <Transition name="pop">
        <div v-if="confirmPull" class="sync__confirm sync__confirm--pull">
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

      <p v-if="sync.auto" class="sync__auto">
        Zmiany zapisują się do arkusza same, a zmiany drugiej osoby pojawiają się tu w kilkanaście sekund.
        Nie trzeba nic klikać.
      </p>

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

.sync__first {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: rgba(200, 162, 74, 0.09);
  border: 1px solid var(--gold-soft);
}

.sync__first-info {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.5;
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

.sync__retry {
  width: 100%;
  margin-top: 12px;
}

.sync__auto {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-faint);
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
