import { reactive, watch } from 'vue'
import { parseMoney } from './money.js'

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
  { type: 'money', label: 'Kwota' },
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
    label: block.label || 'Pole',
    type,
    icon: type === 'installment' ? '💸' : '✦',
    span: type === 'textarea' || type === 'installment' ? 2 : 1,
    placeholder: '',
    editableLabel: true,
  }
}

function fixedBlock(key, value = '') {
  return { id: uid('b'), key, value: key === 'status' ? value || STATUS_OPTIONS[0] : value }
}

export function createVendor(title = 'Nowy usługodawca') {
  return { id: uid('v'), title, blocks: DEFAULT_KEYS.map((k) => fixedBlock(k)) }
}

function seed() {
  return SEED_TITLES.map((t) => createVendor(t))
}

/* ---------------- wczytywanie i migracja ---------------- */

function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object') return null

  if (raw.key && FIELD_DEFS[raw.key]) {
    return { id: raw.id || uid('b'), key: raw.key, value: String(raw.value ?? '') }
  }

  const type = EXTRA_FIELD_TYPES.some((t) => t.type === raw.type) ? raw.type : 'text'
  const block = {
    id: raw.id || uid('b'),
    key: null,
    type,
    label: String(raw.label ?? 'Pole'),
    value: String(raw.value ?? ''),
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
  const vendor = { id: raw?.id || uid('v'), title: String(raw?.title ?? 'Nowy usługodawca'), blocks: [] }
  vendor.blocks = Array.isArray(raw?.blocks)
    ? raw.blocks.map(normalizeBlock).filter(Boolean)
    : migrateFromValues(raw)
  if (!vendor.blocks.length) vendor.blocks = DEFAULT_KEYS.map((k) => fixedBlock(k))
  return vendor
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { vendors: seed(), budget: '', index: 0 }
    const data = JSON.parse(raw)
    const vendors = Array.isArray(data?.vendors) ? data.vendors.map(normalizeVendor) : seed()
    return {
      vendors: vendors.length ? vendors : seed(),
      budget: typeof data?.budget === 'string' ? data.budget : '',
      index: Number.isInteger(data?.index) ? data.index : 0,
    }
  } catch (err) {
    console.warn('[planer] nie udało się wczytać danych, startuję od nowa', err)
    return { vendors: seed(), budget: '', index: 0 }
  }
}

const initial = load()

export const state = reactive({
  vendors: initial.vendors,
  budget: initial.budget,
  index: Math.min(Math.max(0, initial.index), Math.max(0, initial.vendors.length - 1)),
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
        updatedAt: new Date().toISOString(),
      }),
    )
  } catch (err) {
    console.error('[planer] zapis nie powiódł się', err)
  }
}

watch(
  () => [state.vendors, state.budget, state.index],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 250)
  },
  { deep: true },
)

if (typeof window !== 'undefined') {
  const flush = () => {
    clearTimeout(saveTimer)
    persist()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush()
  })
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
  if (v) v.title = title
}

function findBlock(vendorId, blockId) {
  return findVendor(vendorId)?.blocks.find((b) => b.id === blockId)
}

export function setBlockValue(vendorId, blockId, value) {
  const b = findBlock(vendorId, blockId)
  if (b) b.value = value
}

export function setBlockLabel(vendorId, blockId, label) {
  const b = findBlock(vendorId, blockId)
  if (b) b.label = label
}

export function setBlockDue(vendorId, blockId, due) {
  const b = findBlock(vendorId, blockId)
  if (b) b.due = due
}

export function setBlockPaid(vendorId, blockId, paid) {
  const b = findBlock(vendorId, blockId)
  if (b) b.paid = !!paid
}

export function addBlock(vendorId, type = 'text') {
  const v = findVendor(vendorId)
  if (!v) return null

  if (type === 'installment') {
    const nr = installments(v).length + 1
    const block = { id: uid('b'), key: null, type: 'installment', label: `${nr}. transza`, value: '', due: '', paid: false }
    v.blocks.push(block)
    return block
  }

  const block = { id: uid('b'), key: null, type, label: 'Nowe pole', value: '' }
  v.blocks.push(block)
  return block
}

/** Przywraca skasowane pole standardowe. */
export function restoreKey(vendorId, key) {
  const v = findVendor(vendorId)
  if (!v || !FIELD_DEFS[key] || v.blocks.some((b) => b.key === key)) return null
  const block = fixedBlock(key)
  v.blocks.push(block)
  return block
}

export function removeBlock(vendorId, blockId) {
  const v = findVendor(vendorId)
  if (!v) return
  v.blocks = v.blocks.filter((b) => b.id !== blockId)
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
  const v = createVendor(title)
  const pos = Math.min(Math.max(0, after + 1), state.vendors.length)
  state.vendors.splice(pos, 0, v)
  return pos
}

export function removeVendor(vendorId) {
  const i = state.vendors.findIndex((x) => x.id === vendorId)
  if (i === -1) return
  state.vendors.splice(i, 1)
  if (!state.vendors.length) state.vendors.push(createVendor('Nowy usługodawca'))
  setIndex(Math.min(i, state.vendors.length - 1))
}

export function moveVendor(from, to) {
  if (from === to || from < 0 || to < 0 || from >= state.vendors.length || to >= state.vendors.length) return
  const [v] = state.vendors.splice(from, 1)
  state.vendors.splice(to, 0, v)
  state.index = to
}

/* ---------------- podsumowanie ---------------- */

/**
 * Zapłacone = zaliczka + transze oznaczone jako zapłacone.
 * Kwota pełna z pola „Kwota pełna"; jeśli puste, liczymy ją z zaliczki i transz.
 */
export function vendorTotals(vendor) {
  const deposit = parseMoney(value(vendor, 'deposit'))
  const inst = installments(vendor)

  let planned = 0
  let paidInstallments = 0
  for (const b of inst) {
    const amount = parseMoney(b.value)
    planned += amount
    if (b.paid) paidInstallments += amount
  }

  const stated = parseMoney(value(vendor, 'total'))
  const total = stated || deposit + planned
  const paid = deposit + paidInstallments

  return {
    total,
    stated,
    deposit,
    planned,
    paidInstallments,
    paid,
    left: Math.max(0, total - paid),
    count: inst.length,
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
