import { reactive } from 'vue'
import { FIELD_DEFS, applyRemote, blockMeta, onDataChange, snapshot, state } from './store.js'
import { coerceISO } from './dates.js'

const CONFIG_KEY = 'ika-wedding-planner/sync'

/** Wysyłka po ostatniej zmianie — na tyle długo, żeby nie strzelać przy każdej literze. */
const PUSH_DELAY = 3000
/** Jak często telefon pyta arkusz „czy coś się zmieniło". */
const POLL_INTERVAL = 12000
/** Cisza po własnej zmianie, zanim wpuścimy cudze dane — żeby nie wyrwać tekstu spod palców. */
const EDIT_QUIET = 6000

/**
 * Adres i hasło wbudowane przy budowaniu aplikacji (zmienne środowiskowe
 * Vercela). Dzięki nim nikt nie musi niczego wklejać — aplikacja startuje
 * już połączona. W repozytorium tych wartości nie ma.
 */
const ENV_URL = String(import.meta.env.VITE_SHEETS_URL || '').trim()
const ENV_TOKEN = String(import.meta.env.VITE_SHEETS_TOKEN || '').trim()

export const sync = reactive({
  url: '',
  token: '',
  /** true = adres i hasło z konfiguracji, użytkownik nic nie wpisywał */
  auto: false,
  connected: false,
  busy: '',
  lastPushAt: '',
  lastPullAt: '',
  error: '',
  pending: false,
})

function readConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const cfg = JSON.parse(raw)
      sync.url = typeof cfg?.url === 'string' ? cfg.url : ''
      sync.token = typeof cfg?.token === 'string' ? cfg.token : ''
      sync.lastPushAt = cfg?.lastPushAt || ''
      sync.lastPullAt = cfg?.lastPullAt || ''
    }
  } catch {
    /* pusta albo uszkodzona konfiguracja */
  }

  // ręczne ustawienie ma pierwszeństwo, ale normalnie nikt go nie używa
  if (!sync.url && ENV_URL && ENV_TOKEN) {
    sync.url = ENV_URL
    sync.token = ENV_TOKEN
    sync.auto = true
  }
  sync.connected = !!(sync.url && sync.token)
}

function writeConfig() {
  try {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        // wbudowanych wartości nie zapisujemy — inaczej zmiana w Vercelu
        // nigdy by nie doszła do telefonu
        url: sync.auto ? '' : sync.url,
        token: sync.auto ? '' : sync.token,
        lastPushAt: sync.lastPushAt,
        lastPullAt: sync.lastPullAt,
      }),
    )
  } catch (err) {
    console.error('[planer] nie udało się zapisać ustawień synchronizacji', err)
  }
}

/**
 * Apps Script nie obsługuje zapytania wstępnego CORS, dlatego wysyłamy
 * text/plain — przeglądarka wtedy go nie wysyła, a skrypt i tak dostaje JSON.
 */
async function call(payload) {
  if (!sync.url || !sync.token) throw new Error('Brak adresu skryptu lub hasła')

  const res = await fetch(sync.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: sync.token }),
    redirect: 'follow',
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      'Skrypt nie odpowiedział danymi. Sprawdź, czy wdrożenie ma dostęp „Wszyscy" i czy adres kończy się na /exec.',
    )
  }
  if (!res.ok) throw new Error(`Błąd ${res.status}`)
  if (data.error) throw new Error(data.error)
  return data
}

/* ---------------- zamiana danych na wiersze arkusza ---------------- */

export function toRows(vendors) {
  const rows = []
  vendors.forEach((vendor, vi) => {
    vendor.blocks.forEach((block, bi) => {
      const meta = blockMeta(block)
      rows.push([
        vendor.title,
        meta.label,
        block.value ?? '',
        block.due ?? '',
        block.paid ? 'tak' : '',
        vendor.id,
        block.id,
        block.key || '',
        block.key ? '' : block.type || 'text',
        String(vi + 1),
        String(bi + 1),
      ])
    })
  })
  return rows
}

const PRAWDA = /^(tak|true|1|x|✓|v|prawda)$/i

export function fromRows(rows) {
  const vendors = new Map()

  rows.forEach((row, i) => {
    const [title, label, value, due, paid, vendorId, blockId, key, type, vOrder, bOrder] = row.map((c) =>
      c === null || c === undefined ? '' : String(c),
    )
    if (!title && !label && !value) return

    const vKey = vendorId || `tytuł:${title}`
    if (!vendors.has(vKey)) {
      vendors.set(vKey, {
        id: vendorId || undefined,
        title: title || 'Nowa kartka',
        order: Number(vOrder) || 9999,
        blocks: [],
      })
    }
    const vendor = vendors.get(vKey)
    if (title && vendor.title === 'Nowa kartka') vendor.title = title

    const known = key && FIELD_DEFS[key]
    const block = known
      ? { id: blockId || undefined, key, value }
      : { id: blockId || undefined, key: null, type: type || 'text', label: label || 'Pole', value }

    if (block.type === 'installment') {
      block.due = coerceISO(due)
      block.paid = PRAWDA.test(paid.trim())
    }
    block.order = Number(bOrder) || 9999 + i
    vendor.blocks.push(block)
  })

  return [...vendors.values()]
    .sort((a, b) => a.order - b.order)
    .map((v) => ({ id: v.id, title: v.title, blocks: v.blocks.sort((a, b) => a.order - b.order) }))
}

/* ---------------- operacje ---------------- */

export function connect(url, token) {
  sync.url = String(url || '').trim()
  sync.token = String(token || '').trim()
  sync.auto = false
  sync.connected = !!(sync.url && sync.token)
  sync.error = ''
  writeConfig()
}

export function disconnect() {
  sync.lastPushAt = ''
  sync.lastPullAt = ''
  sync.error = ''
  sync.pending = false
  clearTimeout(pushTimer)
  if (!sync.auto) {
    sync.url = ''
    sync.token = ''
    sync.connected = false
  }
  writeConfig()
}

/** Wysyła wszystko do arkusza. Nadpisuje arkusz stanem z telefonu. */
export async function push({ silent = false } = {}) {
  if (!sync.connected || sync.busy) return
  sync.busy = 'push'
  if (!silent) sync.error = ''
  try {
    const snap = snapshot()
    await call({
      action: 'write',
      rows: toRows(snap.vendors),
      budget: snap.budget,
      updatedAt: snap.updatedAt,
    })
    knownRemoteStamp = snap.updatedAt
    sync.lastPushAt = new Date().toISOString()
    sync.pending = false
    sync.error = ''
    writeConfig()
  } catch (err) {
    if (!silent) sync.error = err.message
    sync.pending = true
  } finally {
    sync.busy = ''
  }
}

/** Pobiera arkusz i podmienia nim dane w telefonie. */
export async function pull({ silent = false } = {}) {
  if (!sync.connected || sync.busy) return null
  sync.busy = 'pull'
  if (!silent) sync.error = ''
  try {
    const data = await call({ action: 'read' })
    const vendors = fromRows(Array.isArray(data.rows) ? data.rows : [])
    if (!vendors.length) throw new Error('Arkusz jest pusty — nie ma czego pobrać')
    applyRemote({
      vendors,
      budget: typeof data.budget === 'string' ? data.budget : undefined,
      updatedAt: data.updatedAt,
    })
    knownRemoteStamp = data.updatedAt || ''
    sync.lastPullAt = new Date().toISOString()
    sync.error = ''
    writeConfig()
    return { kartki: vendors.length }
  } catch (err) {
    if (!silent) sync.error = err.message
    return null
  } finally {
    sync.busy = ''
  }
}

/** Sprawdza połączenie i zagląda, co jest w arkuszu. Niczego nie zmienia. */
export async function test() {
  sync.busy = 'test'
  sync.error = ''
  try {
    const data = await call({ action: 'read' })
    const rows = Array.isArray(data.rows) ? data.rows : []
    return { ok: true, wierszy: rows.length, kartek: fromRows(rows).length }
  } catch (err) {
    sync.error = err.message
    return { ok: false }
  } finally {
    sync.busy = ''
  }
}

/* ---------------- automatyczna synchronizacja ---------------- */

let pushTimer = null
let pollTimer = null
let lastLocalEditAt = 0
let knownRemoteStamp = ''

/** Sam znacznik czasu z arkusza. Starszy skrypt tego nie zna — wtedy pełny odczyt. */
async function remoteStamp() {
  try {
    const data = await call({ action: 'stamp' })
    return String(data.updatedAt || '')
  } catch (err) {
    if (!/Nieznana akcja/i.test(err.message)) throw err
    const data = await call({ action: 'read' })
    return String(data.updatedAt || '')
  }
}

function userIsTyping() {
  const el = document.activeElement
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Pobiera cudze zmiany, ale tylko wtedy, gdy jest bezpiecznie: nic nie czeka na
 * wysłanie, użytkownik nic nie pisze i od jego ostatniej zmiany minęła chwila.
 */
async function poll() {
  if (!sync.connected || sync.busy || sync.pending) return
  if (document.hidden || userIsTyping()) return
  if (Date.now() - lastLocalEditAt < EDIT_QUIET) return

  try {
    const stamp = await remoteStamp()
    if (!stamp || stamp === knownRemoteStamp) return
    knownRemoteStamp = stamp
    // arkusz jest nowszy niż to, co mamy — bierzemy jego wersję
    if (stamp > (state.updatedAt || '')) await pull({ silent: true })
  } catch {
    /* brak sieci albo chwilowy błąd — spróbujemy za chwilę */
  }
}

export function initSync() {
  readConfig()

  onDataChange(() => {
    if (!sync.connected) return
    lastLocalEditAt = Date.now()
    sync.pending = true
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => push({ silent: true }), PUSH_DELAY)
  })

  pollTimer = setInterval(poll, POLL_INTERVAL)

  document.addEventListener('visibilitychange', () => {
    if (!sync.connected) return
    if (document.hidden) {
      // wychodzimy z aplikacji — dosyłamy to, co czeka
      if (sync.pending) {
        clearTimeout(pushTimer)
        push({ silent: true })
      }
      return
    }
    poll()
  })

  window.addEventListener('online', () => {
    if (!sync.connected) return
    if (sync.pending) push({ silent: true })
    else poll()
  })

  // pierwsze sprawdzenie zaraz po starcie
  if (sync.connected) setTimeout(poll, 800)
}
