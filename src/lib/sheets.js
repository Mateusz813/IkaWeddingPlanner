import { reactive } from 'vue'
import { FIELD_DEFS, applyRemote, blockMeta, onDataChange, snapshot } from './store.js'
import { coerceISO } from './dates.js'

const CONFIG_KEY = 'ika-wedding-planner/sync'

/**
 * Adres i hasło wbudowane przy budowaniu aplikacji (zmienne środowiskowe
 * Vercela). Dzięki nim nikt nie musi niczego wklejać.
 */
const ENV_URL = String(import.meta.env.VITE_SHEETS_URL || '').trim()
const ENV_TOKEN = String(import.meta.env.VITE_SHEETS_TOKEN || '').trim()

/**
 * Synchronizacja jest w całości ręczna: zapis i odczyt dzieją się WYŁĄCZNIE po
 * naciśnięciu przycisku. Nic nie chodzi w tle, nic nie wysyła się samo.
 */
export const sync = reactive({
  url: '',
  token: '',
  auto: false,
  connected: false,
  busy: '',
  lastPushAt: '',
  lastPullAt: '',
  error: '',
  /** są zmiany zrobione po ostatnim zapisie do arkusza */
  unsaved: false,
})

function readConfig() {
  let zapisane = null
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) zapisane = JSON.parse(raw)
  } catch {
    /* pusta albo uszkodzona konfiguracja */
  }

  sync.lastPushAt = zapisane?.lastPushAt || ''
  sync.lastPullAt = zapisane?.lastPullAt || ''

  if (ENV_URL && ENV_TOKEN) {
    // Adres z konfiguracji wdrożenia jest źródłem prawdy i wygrywa z tym, co
    // ktoś kiedyś wkleił ręcznie. Inaczej telefon, na którym raz wpisano stary
    // adres, zostawał na nim na zawsze i podmiana adresu nigdy by nie dotarła.
    sync.url = ENV_URL
    sync.token = ENV_TOKEN
    sync.auto = true
    if (zapisane?.url || zapisane?.token) writeConfig()
  } else {
    sync.url = typeof zapisane?.url === 'string' ? zapisane.url : ''
    sync.token = typeof zapisane?.token === 'string' ? zapisane.token : ''
    sync.auto = false
  }

  sync.connected = !!(sync.url && sync.token)
}

/** Ostatnie znaki adresu skryptu — do rozpoznania, z którym wdrożeniem gadamy. */
export function ktoryScript() {
  const m = /\/macros\/s\/([^/]+)\//.exec(sync.url)
  return m ? '…' + m[1].slice(-8) : '—'
}

function writeConfig() {
  try {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
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

/** Nagłówki wysyłamy razem z danymi, żeby skrypt nie musiał ich znać z góry. */
export const KOLUMNY = [
  'Kartka',
  'Pole',
  'Wartość',
  'Termin',
  'Zapłacone',
  'id kartki',
  'id pola',
  'klucz',
  'typ',
  'nr kartki',
  'nr pola',
  'zmieniono',
  'kartka zmieniono',
]

export function toRows(vendors) {
  const rows = []
  vendors.forEach((vendor, vi) => {
    vendor.blocks.forEach((block, bi) => {
      const meta = blockMeta(block)
      rows.push([
        vendor.title ?? '',
        meta.label ?? '',
        block.value ?? '',
        block.due ?? '',
        block.paid ? 'tak' : '',
        vendor.id ?? '',
        block.id ?? '',
        block.key || '',
        block.key ? '' : block.type || 'text',
        // kolejność kartek i kafelków — dzięki temu układ z przeciągania wraca
        String(vi + 1),
        String(bi + 1),
        block.at || '',
        vendor.at || '',
      ].map((c) => (c === null || c === undefined ? '' : String(c))))
    })
  })
  return rows
}

const PRAWDA = /^(tak|true|1|x|✓|v|prawda)$/i

export function fromRows(rows) {
  const vendors = new Map()

  rows.forEach((row, i) => {
    // wiersz może mieć mniej kolumn (starszy arkusz) — brakujące traktujemy jako puste
    const k = (n) => (row[n] === null || row[n] === undefined ? '' : String(row[n]))
    const title = k(0)
    const label = k(1)
    const value = k(2)
    const due = k(3)
    const paid = k(4)
    const vendorId = k(5)
    const blockId = k(6)
    const key = k(7)
    const type = k(8)
    const vOrder = k(9)
    const bOrder = k(10)
    const blockAt = k(11)
    const vendorAt = k(12)

    if (!title && !label && !value) return

    const vKey = vendorId || `tytuł:${title}`
    if (!vendors.has(vKey)) {
      vendors.set(vKey, {
        id: vendorId || undefined,
        title: title || 'Nowa kartka',
        at: vendorAt,
        order: Number(vOrder) || 9999 + i,
        blocks: [],
      })
    }
    const vendor = vendors.get(vKey)
    if (title && vendor.title === 'Nowa kartka') vendor.title = title

    const known = key && FIELD_DEFS[key]
    const block = known
      ? { id: blockId || undefined, key, value, at: blockAt }
      : { id: blockId || undefined, key: null, type: type || 'text', label: label || 'Pole', value, at: blockAt }

    if (block.type === 'installment') {
      block.due = coerceISO(due)
      block.paid = PRAWDA.test(paid.trim())
    }
    block.order = Number(bOrder) || 9999 + i
    vendor.blocks.push(block)
  })

  return [...vendors.values()]
    .sort((a, b) => a.order - b.order)
    .map((v) => ({ id: v.id, title: v.title, at: v.at, blocks: v.blocks.sort((a, b) => a.order - b.order) }))
}

/* ---------------- operacje (tylko z przycisku) ---------------- */

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
  if (!sync.auto) {
    sync.url = ''
    sync.token = ''
    sync.connected = false
  }
  writeConfig()
}

/** ZAPIS: cała zawartość telefonu ląduje w arkuszu, razem z kolejnością. */
export async function push() {
  if (!sync.connected || sync.busy) return null
  sync.busy = 'push'
  sync.error = ''
  try {
    const snap = snapshot()
    const rows = toRows(snap.vendors)
    await call({
      action: 'write',
      columns: KOLUMNY,
      rows,
      budget: snap.budget,
      updatedAt: new Date().toISOString(),
    })
    sync.lastPushAt = new Date().toISOString()
    sync.unsaved = false
    writeConfig()
    return { kartki: snap.vendors.length, wierszy: rows.length }
  } catch (err) {
    sync.error = err.message
    return null
  } finally {
    sync.busy = ''
  }
}

/** ODCZYT: zawartość arkusza zastępuje to, co jest w telefonie. */
export async function pull() {
  if (!sync.connected || sync.busy) return null
  sync.busy = 'pull'
  sync.error = ''
  try {
    const data = await call({ action: 'read' })
    const vendors = fromRows(Array.isArray(data.rows) ? data.rows : [])
    if (!vendors.length) throw new Error('Arkusz jest pusty — nie ma czego wczytać')
    applyRemote({ vendors, budget: typeof data.budget === 'string' ? data.budget : undefined })
    sync.lastPullAt = new Date().toISOString()
    sync.unsaved = false
    writeConfig()
    return { kartki: vendors.length }
  } catch (err) {
    sync.error = err.message
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

/**
 * Jedyne, co dzieje się samo: zapalenie informacji „masz niezapisane zmiany".
 * Żadnych zapytań do arkusza bez naciśnięcia przycisku.
 */
export function initSync() {
  readConfig()
  onDataChange(() => {
    sync.unsaved = true
  })
}
