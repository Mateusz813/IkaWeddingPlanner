import { reactive } from 'vue'
import { FIELD_DEFS, applyRemote, blockMeta, onDataChange, snapshot } from './store.js'
import { coerceISO } from './dates.js'

const CONFIG_KEY = 'ika-wedding-planner/sync'
const PUSH_DELAY = 3000

/**
 * Zapis do arkusza idzie automatycznie po każdej zmianie.
 * Pobieranie NIGDY nie dzieje się samo — tylko z przycisku, bo nadpisuje
 * wszystko, co jest w telefonie.
 */
export const sync = reactive({
  url: '',
  token: '',
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
    if (!raw) return
    const cfg = JSON.parse(raw)
    sync.url = typeof cfg?.url === 'string' ? cfg.url : ''
    sync.token = typeof cfg?.token === 'string' ? cfg.token : ''
    sync.lastPushAt = cfg?.lastPushAt || ''
    sync.lastPullAt = cfg?.lastPullAt || ''
    sync.connected = !!(sync.url && sync.token)
  } catch {
    /* pusta albo uszkodzona konfiguracja */
  }
}

function writeConfig() {
  try {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        url: sync.url,
        token: sync.token,
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
  sync.connected = !!(sync.url && sync.token)
  sync.error = ''
  writeConfig()
}

export function disconnect() {
  sync.url = ''
  sync.token = ''
  sync.connected = false
  sync.error = ''
  sync.pending = false
  // czyścimy też znaczniki, żeby po ponownym połączeniu znów zapytać
  // o kierunek pierwszej synchronizacji zamiast wysyłać w ciemno
  sync.lastPushAt = ''
  sync.lastPullAt = ''
  clearTimeout(pushTimer)
  writeConfig()
}

/** Wysyła wszystko do arkusza. Nadpisuje arkusz stanem z telefonu. */
export async function push() {
  if (!sync.connected || sync.busy) return
  sync.busy = 'push'
  sync.error = ''
  try {
    const snap = snapshot()
    await call({
      action: 'write',
      rows: toRows(snap.vendors),
      budget: snap.budget,
      updatedAt: snap.updatedAt,
    })
    sync.lastPushAt = new Date().toISOString()
    sync.pending = false
    writeConfig()
  } catch (err) {
    sync.error = err.message
    sync.pending = true
  } finally {
    sync.busy = ''
  }
}

/**
 * Pobiera arkusz i PODMIENIA nim dane w telefonie.
 * Wołane wyłącznie ręcznie, po potwierdzeniu przez użytkownika.
 */
export async function pull() {
  if (!sync.connected || sync.busy) return null
  sync.busy = 'pull'
  sync.error = ''
  try {
    const data = await call({ action: 'read' })
    const vendors = fromRows(Array.isArray(data.rows) ? data.rows : [])
    if (!vendors.length) throw new Error('Arkusz jest pusty — nie ma czego pobrać')
    applyRemote({ vendors, budget: typeof data.budget === 'string' ? data.budget : undefined, updatedAt: data.updatedAt })
    sync.lastPullAt = new Date().toISOString()
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

/* ---------------- automatyczny zapis ---------------- */

let pushTimer = null

export function initSync() {
  readConfig()

  onDataChange(() => {
    if (!sync.connected) return
    sync.pending = true
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      push().catch(() => {})
    }, PUSH_DELAY)
  })

  // zapis przy chowaniu aplikacji, żeby nie zgubić ostatnich zmian
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && sync.connected && sync.pending) {
      clearTimeout(pushTimer)
      push().catch(() => {})
    }
  })

  window.addEventListener('online', () => {
    if (sync.connected && sync.pending) push().catch(() => {})
  })
}
