import { nextTick, reactive, watch } from 'vue'
import { parseMoney } from './money.js'
import { mergeTombstones, mergeVendors, pruneTombstones } from './merge.js'

const STORAGE_KEY = 'ika-wedding-planner/v1'

/**
 * Kartka to jedna lista bloków (kafelków) — dzięki temu każdy da się przestawić.
 * Blok stały ma `key` i bierze etykietę/typ stąd; blok własny trzyma je u siebie.
 */
export const FIELD_DEFS = {
  name: { label: 'Nazwa usługodawcy', type: 'text', icon: '🏷️', span: 2, placeholder: 'np. Dwór Pod Lipami' },
  total: { label: 'Kwota pełna', type: 'money', icon: '💰', span: 1, placeholder: '0' },
  deposit: { label: 'Zaliczka', type: 'money', icon: '🧾', span: 1, placeholder: '0' },
  status: { label: 'Status', type: 'status', icon: '✅', span: 2 },
  dueDate: { label: 'Zapłata do', type: 'date', icon: '📅', span: 1 },
  eventDate: { label: 'Data usługi', type: 'date', icon: '⏰', span: 1 },
  contact: { label: 'Osoba kontaktowa', type: 'text', icon: '👤', span: 2, placeholder: 'Imię i nazwisko' },
  phone: { label: 'Telefon', type: 'tel', icon: '📞', span: 2, placeholder: '+48 000 000 000' },
  phone2: { label: 'Telefon dodatkowy', type: 'tel', icon: '📱', span: 2, placeholder: '+48 000 000 000' },
  email: { label: 'E-mail', type: 'email', icon: '✉️', span: 2, placeholder: 'kontakt@firma.pl' },
  www: { label: 'Strona / Instagram', type: 'url', icon: '🌐', span: 2, placeholder: 'www...' },
  address: { label: 'Adres', type: 'text', icon: '📍', span: 2, placeholder: 'Ulica, miasto' },
  notes: { label: 'Notatki', type: 'textarea', icon: '📝', span: 2, placeholder: 'Co ustalone, co do dogadania...' },
}

export const DEFAULT_KEYS = [
  'name',
  'total',
  'deposit',
  'status',
  'dueDate',
  'eventDate',
  'contact',
  'phone',
  'phone2',
  'email',
  'www',
  'address',
  'notes',
]

export const STATUS_OPTIONS = [
  'Do ustalenia',
  'Szukam / porównuję',
  'Po rozmowie',
  'Zarezerwowane',
  'Zaliczka wpłacona',
  'Opłacone w całości',
  'Odpada',
]

export const EXTRA_FIELD_TYPES = [
  { type: 'installment', label: 'Transza / rata' },
  { type: 'money', label: 'Dodatkowy koszt' },
  { type: 'date', label: 'Data' },
  { type: 'text', label: 'Tekst' },
  { type: 'tel', label: 'Telefon' },
  { type: 'email', label: 'E-mail' },
  { type: 'url', label: 'Link' },
  { type: 'textarea', label: 'Dłuższa notatka' },
]

const SEED_TITLES = [
  'Sala weselna',
  'Ślub / ceremonia',
  'Fotograf',
  'Kamerzysta',
  'Zespół / DJ',
  'Tort weselny',
  'Dekoracje i kwiaty',
  'Suknia ślubna',
  'Garnitur',
  'Obrączki',
  'Fryzjer i makijaż',
  'Zaproszenia i papeteria',
  'Fotobudka / atrakcje',
  'Alkohol',
  'Transport',
  'Nocleg gości',
  'Podziękowania dla gości',
  'Podróż poślubna',
]

/** Znacznik zmiany — po nim scalanie wie, czyja wersja jest nowsza. */
function teraz() {
  return new Date().toISOString()
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Etykieta, typ i szerokość bloku — dla stałych pól brane ze słownika. */
export function blockMeta(block) {
  const def = block.key ? FIELD_DEFS[block.key] : null
  if (def) {
    return { ...def, editableLabel: false }
  }
  const type = block.type || 'text'
  return {
    // bez podmiany pustej nazwy na domyślną — inaczej nie da się jej skasować
    label: block.label ?? '',
    type,
    icon: type === 'installment' ? '💸' : '✦',
    span: type === 'textarea' || type === 'installment' ? 2 : 1,
    placeholder: '',
    editableLabel: true,
  }
}

function fixedBlock(key, value = '', at = '') {
  return { id: uid('b'), key, value: key === 'status' ? value || STATUS_OPTIONS[0] : value, at }
}

export function createVendor(title = 'Nowy usługodawca', at = '') {
  return { id: uid('v'), title, at, blocks: DEFAULT_KEYS.map((k) => fixedBlock(k, '', at)) }
}

/** Identyfikator wyprowadzony z nazwy — te same dla każdej świeżej instalacji. */
function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function seed() {
  return SEED_TITLES.map((title) => ({
    id: `v_seed_${slug(title)}`,
    title,
    at: '',
    blocks: DEFAULT_KEYS.map((key) => ({
      id: `b_seed_${slug(title)}_${key}`,
      key,
      value: key === 'status' ? STATUS_OPTIONS[0] : '',
      at: '',
    })),
  }))
}

/* ---------------- wczytywanie i migracja ---------------- */

function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object') return null

  const at = typeof raw.at === 'string' ? raw.at : ''

  if (raw.key && FIELD_DEFS[raw.key]) {
    return { id: raw.id || uid('b'), key: raw.key, value: String(raw.value ?? ''), at }
  }

  const type = EXTRA_FIELD_TYPES.some((t) => t.type === raw.type) ? raw.type : 'text'
  const block = {
    id: raw.id || uid('b'),
    key: null,
    type,
    label: String(raw.label ?? 'Pole'),
    value: String(raw.value ?? ''),
    at,
  }
  if (type === 'installment') {
    block.due = String(raw.due ?? '')
    block.paid = !!raw.paid
  }
  return block
}

/** Starszy zapis (values + extra) na listę bloków. */
function migrateFromValues(raw) {
  const blocks = DEFAULT_KEYS.map((k) => fixedBlock(k, String(raw?.values?.[k] ?? '')))
  if (Array.isArray(raw?.extra)) {
    for (const e of raw.extra) {
      const b = normalizeBlock({ ...e, key: null })
      if (b) blocks.push(b)
    }
  }
  return blocks
}

function normalizeVendor(raw) {
  const vendor = {
    id: raw?.id || uid('v'),
    title: String(raw?.title ?? 'Nowy usługodawca'),
    at: typeof raw?.at === 'string' ? raw.at : '',
    blocks: [],
  }
  const blocks = Array.isArray(raw?.blocks)
    ? raw.blocks.map(normalizeBlock).filter(Boolean)
    : migrateFromValues(raw)

  // Pole stałe może wystąpić tylko raz — przy dwóch „Kwotach pełnych" liczenie
  // brałoby pierwszą i cicho gubiło drugą. Nadmiar zostaje jako pole własne.
  const seen = new Set()
  vendor.blocks = blocks.map((block) => {
    if (!block.key) return block
    if (!seen.has(block.key)) {
      seen.add(block.key)
      return block
    }
    const def = FIELD_DEFS[block.key]
    return { id: block.id, key: null, type: def?.type || 'text', label: def?.label || 'Pole', value: block.value }
  })

  if (!vendor.blocks.length) vendor.blocks = DEFAULT_KEYS.map((k) => fixedBlock(k))
  return vendor
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { vendors: seed(), budget: '', index: 0, updatedAt: '', deleted: {} }
    const data = JSON.parse(raw)
    const vendors = Array.isArray(data?.vendors) ? data.vendors.map(normalizeVendor) : seed()
    return {
      vendors: vendors.length ? vendors : seed(),
      budget: typeof data?.budget === 'string' ? data.budget : '',
      index: Number.isInteger(data?.index) ? data.index : 0,
      updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
      deleted: data?.deleted && typeof data.deleted === 'object' ? data.deleted : {},
    }
  } catch (err) {
    console.warn('[planer] nie udało się wczytać danych, startuję od nowa', err)
    return { vendors: seed(), budget: '', index: 0, updatedAt: '', deleted: {} }
  }
}

const initial = load()

export const state = reactive({
  vendors: initial.vendors,
  budget: initial.budget,
  index: Math.min(Math.max(0, initial.index), Math.max(0, initial.vendors.length - 1)),
  /**
   * Kiedy ostatnio zmieniły się dane (nie licząc przewracania kartek).
   * Świeża instalacja zaczyna pusto, żeby przy synchronizacji nie wyglądała na
   * nowszą od arkusza i nie nadpisała go pustymi kartkami.
   */
  updatedAt: initial.updatedAt || '',
  /** Skasowane kartki i kafelki: id → kiedy. Bez tego wracałyby przy scalaniu. */
  deleted: pruneTombstones(initial.deleted || {}),
})

let saveTimer = null
function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        vendors: state.vendors,
        budget: state.budget,
        index: state.index,
        updatedAt: state.updatedAt,
        deleted: state.deleted,
      }),
    )
  } catch (err) {
    console.error('[planer] zapis nie powiódł się', err)
  }
}

function schedulePersist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 250)
}

/** Nasłuch dla synchronizacji z arkuszem — wołany tylko przy zmianie danych. */
const changeListeners = new Set()

export function onDataChange(fn) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

let applyingRemote = false

watch(
  () => [state.vendors, state.budget],
  () => {
    if (!applyingRemote) {
      state.updatedAt = new Date().toISOString()
      for (const fn of changeListeners) fn()
    }
    schedulePersist()
  },
  { deep: true },
)

// samo przewracanie kartek to nie zmiana danych — zapisujemy, ale nie wysyłamy
watch(() => state.index, schedulePersist)

export function snapshot() {
  return {
    vendors: state.vendors,
    budget: state.budget,
    updatedAt: state.updatedAt,
    deleted: state.deleted,
  }
}

/**
 * Wciąga zmiany z arkusza, scalając je z tym, co jest w telefonie — pole po
 * polu, wygrywa nowszy znacznik. Nic nie jest nadpisywane hurtem.
 * Zwraca true, jeśli cokolwiek się zmieniło.
 */
export function mergeRemote({ vendors, budget, updatedAt, deleted }) {
  const tombstones = pruneTombstones(mergeTombstones(state.deleted, deleted || {}))
  const remote = (Array.isArray(vendors) ? vendors : []).map(normalizeVendor)

  // Telefon, który jeszcze niczego nie zmieniał, ma tylko puste kartki startowe.
  // Scalanie dołożyłoby je do zawartości arkusza — zamiast tego bierzemy arkusz
  // w całości. Dotyczy nowego telefonu i ponownej instalacji.
  const nicNieZmieniano = !state.updatedAt
  const scalone = nicNieZmieniano && remote.length ? remote : mergeVendors(state.vendors, remote, tombstones)

  const przed = JSON.stringify(state.vendors)
  const po = JSON.stringify(scalone)
  const budzetSieZmienil = typeof budget === 'string' && budget !== state.budget && !state.budget

  if (przed === po && !budzetSieZmienil) {
    state.deleted = tombstones
    if (updatedAt) state.updatedAt = updatedAt
    return false
  }

  applyingRemote = true
  const currentId = state.vendors[state.index]?.id

  state.deleted = tombstones
  state.vendors = scalone.length ? scalone : state.vendors
  // budżet bierzemy z arkusza tylko wtedy, gdy lokalnie go nie ma
  if (budzetSieZmienil) state.budget = budget
  if (updatedAt) state.updatedAt = updatedAt

  const at = state.vendors.findIndex((v) => v.id === currentId)
  setIndex(at >= 0 ? at : state.index)

  nextTick(() => {
    applyingRemote = false
    schedulePersist()
  })
  return true
}

/* ---------------- odczyt ---------------- */

function findVendor(vendorId) {
  return state.vendors.find((v) => v.id === vendorId)
}

/** Wartość stałego pola po kluczu, np. value(vendor, 'name'). */
export function value(vendor, key) {
  return vendor?.blocks.find((b) => b.key === key)?.value ?? ''
}

export function installments(vendor) {
  return vendor?.blocks.filter((b) => b.type === 'installment') ?? []
}

/** Których standardowych pól brakuje — żeby dało się je przywrócić. */
export function missingKeys(vendor) {
  const have = new Set(vendor.blocks.map((b) => b.key).filter(Boolean))
  return DEFAULT_KEYS.filter((k) => !have.has(k))
}

/* ---------------- akcje ---------------- */

export function setIndex(i) {
  state.index = Math.min(Math.max(0, i), Math.max(0, state.vendors.length - 1))
}

export function setTitle(vendorId, title) {
  const v = findVendor(vendorId)
  if (!v) return
  v.title = title
  v.at = teraz()
}

function findBlock(vendorId, blockId) {
  return findVendor(vendorId)?.blocks.find((b) => b.id === blockId)
}

export function setBlockValue(vendorId, blockId, value) {
  const b = findBlock(vendorId, blockId)
  if (!b) return
  b.value = value
  b.at = teraz()
}

export function setBlockLabel(vendorId, blockId, label) {
  const b = findBlock(vendorId, blockId)
  if (!b) return
  b.label = label
  b.at = teraz()
}

export function setBlockDue(vendorId, blockId, due) {
  const b = findBlock(vendorId, blockId)
  if (!b) return
  b.due = due
  b.at = teraz()
}

export function setBlockPaid(vendorId, blockId, paid) {
  const b = findBlock(vendorId, blockId)
  if (!b) return
  b.paid = !!paid
  b.at = teraz()
}

const NOWE_POLE_NAZWY = {
  money: 'Dodatkowy koszt',
  date: 'Termin',
  tel: 'Telefon',
  email: 'E-mail',
  url: 'Link',
  textarea: 'Notatka',
}

export function addBlock(vendorId, type = 'text') {
  const v = findVendor(vendorId)
  if (!v) return null

  if (type === 'installment') {
    const nr = installments(v).length + 1
    const block = { id: uid('b'), key: null, type: 'installment', label: `${nr}. transza`, value: '', due: '', paid: false, at: teraz() }
    v.blocks.push(block)
    return block
  }

  const block = { id: uid('b'), key: null, type, label: NOWE_POLE_NAZWY[type] || 'Nowe pole', value: '', at: teraz() }
  v.blocks.push(block)
  return block
}

/** Przywraca skasowane pole standardowe. */
export function restoreKey(vendorId, key) {
  const v = findVendor(vendorId)
  if (!v || !FIELD_DEFS[key] || v.blocks.some((b) => b.key === key)) return null
  const block = fixedBlock(key, '', teraz())
  v.blocks.push(block)
  return block
}

export function removeBlock(vendorId, blockId) {
  const v = findVendor(vendorId)
  if (!v) return
  v.blocks = v.blocks.filter((b) => b.id !== blockId)
  state.deleted[blockId] = teraz()
}

/**
 * Przenosi kafelek (drag & drop). `to` liczone jest w liście BEZ przenoszonego
 * bloku — tak jak pozycja pustego miejsca pokazywanego podczas przeciągania.
 */
export function moveBlock(vendorId, from, to) {
  const v = findVendor(vendorId)
  if (!v) return
  if (from < 0 || from >= v.blocks.length) return
  const [block] = v.blocks.splice(from, 1)
  v.blocks.splice(Math.min(Math.max(0, to), v.blocks.length), 0, block)
}

/**
 * Dodaje nową kartkę zaraz za bieżącą i zwraca jej pozycję.
 * Nie zmienia state.index — dzięki temu widok książki może tam „przewrócić kartkę".
 */
export function addVendor(title = 'Nowy usługodawca', after = state.index) {
  const v = createVendor(title, teraz())
  const pos = Math.min(Math.max(0, after + 1), state.vendors.length)
  state.vendors.splice(pos, 0, v)
  return pos
}

export function removeVendor(vendorId) {
  const i = state.vendors.findIndex((x) => x.id === vendorId)
  if (i === -1) return
  // kartkę i jej kafelki trzeba zapamiętać jako skasowane, inaczej wrócą
  // przy scalaniu z kopią z drugiego telefonu
  const znacznik = teraz()
  state.deleted[vendorId] = znacznik
  for (const block of state.vendors[i].blocks) state.deleted[block.id] = znacznik
  state.vendors.splice(i, 1)
  if (!state.vendors.length) state.vendors.push(createVendor('Nowy usługodawca'))
  setIndex(Math.min(i, state.vendors.length - 1))
}

/** Jak moveBlock: `to` liczone w liście bez przenoszonej kartki. */
export function moveVendor(from, to) {
  if (from < 0 || from >= state.vendors.length) return
  // zostajemy na tej kartce, którą użytkownik ogląda — nawet jeśli przesunął inną
  const currentId = state.vendors[state.index]?.id
  const [vendor] = state.vendors.splice(from, 1)
  state.vendors.splice(Math.min(Math.max(0, to), state.vendors.length), 0, vendor)
  const at = state.vendors.findIndex((v) => v.id === currentId)
  if (at >= 0) state.index = at
}

/* ---------------- podsumowanie ---------------- */

/**
 * Koszt kartki = kwota podstawowa + koszty dodatkowe.
 *
 * Kwota podstawowa to „Kwota pełna", a gdy tego kafelka nie ma lub jest pusty —
 * zaliczka razem z transzami (żeby suma nie leciała na zero).
 * Koszty dodatkowe to własne kafelki z kwotą, które użytkownik sam dorzucił.
 * Zapłacone = zaliczka + transze oznaczone jako zapłacone.
 */
export function vendorTotals(vendor) {
  const deposit = parseMoney(value(vendor, 'deposit'))

  let planned = 0
  let paidInstallments = 0
  let extra = 0
  let extraCount = 0
  let installmentCount = 0

  for (const block of vendor.blocks) {
    if (block.type === 'installment') {
      const amount = parseMoney(block.value)
      planned += amount
      installmentCount += 1
      if (block.paid) paidInstallments += amount
    } else if (!block.key && block.type === 'money') {
      extra += parseMoney(block.value)
      extraCount += 1
    }
  }

  const stated = parseMoney(value(vendor, 'total'))
  const base = stated || deposit + planned
  const total = base + extra
  const paid = deposit + paidInstallments

  return {
    total,
    base,
    stated,
    deposit,
    planned,
    paidInstallments,
    paid,
    extra,
    extraCount,
    left: Math.max(0, total - paid),
    count: installmentCount,
    /** zaliczka + transze wychodzą poza kwotę pełną — pewnie literówka */
    overplanned: stated > 0 && deposit + planned > stated + 0.005,
  }
}

export function summary() {
  let total = 0
  let paid = 0
  for (const v of state.vendors) {
    const t = vendorTotals(v)
    total += t.total
    paid += t.paid
  }
  const budget = parseMoney(state.budget)
  return {
    total,
    paid,
    left: Math.max(0, total - paid),
    budget,
    diff: budget - total,
    hasBudget: budget > 0,
    filled: state.vendors.filter((v) => vendorTotals(v).total > 0).length,
    count: state.vendors.length,
  }
}

/* ---------------- kopia zapasowa ---------------- */

export function exportData() {
  return JSON.stringify(
    { version: 2, vendors: state.vendors, budget: state.budget, exportedAt: new Date().toISOString() },
    null,
    2,
  )
}

export function importData(json) {
  const data = JSON.parse(json)
  if (!Array.isArray(data?.vendors)) throw new Error('Plik nie zawiera listy usługodawców')
  state.vendors = data.vendors.map(normalizeVendor)
  if (!state.vendors.length) state.vendors = seed()
  state.budget = typeof data.budget === 'string' ? data.budget : ''
  setIndex(0)
}
