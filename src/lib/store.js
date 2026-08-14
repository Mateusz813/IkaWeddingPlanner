import { reactive, watch } from 'vue'
import { parseMoney } from './money.js'

const STORAGE_KEY = 'ika-wedding-planner/v1'

/** Stałe "cegiełki" na każdej kartce usługodawcy. */
export const FIELDS = [
  { key: 'name', label: 'Nazwa usługodawcy', type: 'text', icon: '🏷️', span: 2, placeholder: 'np. Dwór Pod Lipami' },
  { key: 'total', label: 'Kwota pełna', type: 'money', icon: '💰', span: 1, placeholder: '0' },
  { key: 'deposit', label: 'Zaliczka', type: 'money', icon: '🧾', span: 1, placeholder: '0' },
  { key: 'status', label: 'Status', type: 'status', icon: '✅', span: 2 },
  { key: 'dueDate', label: 'Termin zapłaty', type: 'date', icon: '📅', span: 1 },
  { key: 'eventDate', label: 'Data usługi', type: 'date', icon: '⏰', span: 1 },
  { key: 'contact', label: 'Osoba kontaktowa', type: 'text', icon: '👤', span: 2, placeholder: 'Imię i nazwisko' },
  { key: 'phone', label: 'Telefon', type: 'tel', icon: '📞', span: 2, placeholder: '+48 000 000 000' },
  { key: 'phone2', label: 'Telefon dodatkowy', type: 'tel', icon: '📱', span: 2, placeholder: '+48 000 000 000' },
  { key: 'email', label: 'E-mail', type: 'email', icon: '✉️', span: 2, placeholder: 'kontakt@firma.pl' },
  { key: 'www', label: 'Strona / Instagram', type: 'url', icon: '🌐', span: 2, placeholder: 'www...' },
  { key: 'address', label: 'Adres', type: 'text', icon: '📍', span: 2, placeholder: 'Ulica, miasto' },
  { key: 'notes', label: 'Notatki', type: 'textarea', icon: '📝', span: 2, placeholder: 'Co ustalone, co do dogadania...' },
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
  { type: 'text', label: 'Tekst' },
  { type: 'money', label: 'Kwota' },
  { type: 'tel', label: 'Telefon' },
  { type: 'email', label: 'E-mail' },
  { type: 'url', label: 'Link' },
  { type: 'date', label: 'Data' },
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

export function createVendor(title = 'Nowy usługodawca') {
  const values = {}
  for (const f of FIELDS) values[f.key] = ''
  values.status = STATUS_OPTIONS[0]
  return { id: uid('v'), title, values, extra: [] }
}

function seed() {
  return SEED_TITLES.map((t) => createVendor(t))
}

function normalizeVendor(raw) {
  const v = createVendor(raw?.title || 'Nowy usługodawca')
  v.id = raw?.id || v.id
  if (raw?.values && typeof raw.values === 'object') {
    for (const f of FIELDS) {
      const val = raw.values[f.key]
      if (typeof val === 'string' || typeof val === 'number') v.values[f.key] = String(val)
    }
  }
  if (Array.isArray(raw?.extra)) {
    v.extra = raw.extra
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        id: e.id || uid('f'),
        label: String(e.label ?? 'Pole'),
        type: EXTRA_FIELD_TYPES.some((t) => t.type === e.type) ? e.type : 'text',
        value: String(e.value ?? ''),
      }))
  }
  return v
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
  savedAt: null,
})

let saveTimer = null
function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        vendors: state.vendors,
        budget: state.budget,
        index: state.index,
        updatedAt: new Date().toISOString(),
      }),
    )
    state.savedAt = Date.now()
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

// zapisz natychmiast przy zamykaniu / chowaniu aplikacji
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

/* ---------------- akcje ---------------- */

export function setIndex(i) {
  state.index = Math.min(Math.max(0, i), Math.max(0, state.vendors.length - 1))
}

export function setTitle(vendorId, title) {
  const v = state.vendors.find((x) => x.id === vendorId)
  if (v) v.title = title
}

export function setValue(vendorId, key, value) {
  const v = state.vendors.find((x) => x.id === vendorId)
  if (v) v.values[key] = value
}

export function setExtraValue(vendorId, fieldId, value) {
  const v = state.vendors.find((x) => x.id === vendorId)
  const f = v?.extra.find((x) => x.id === fieldId)
  if (f) f.value = value
}

export function setExtraLabel(vendorId, fieldId, label) {
  const v = state.vendors.find((x) => x.id === vendorId)
  const f = v?.extra.find((x) => x.id === fieldId)
  if (f) f.label = label
}

export function addExtraField(vendorId, label = 'Nowe pole', type = 'text') {
  const v = state.vendors.find((x) => x.id === vendorId)
  if (!v) return null
  const field = { id: uid('f'), label, type, value: '' }
  v.extra.push(field)
  return field
}

export function removeExtraField(vendorId, fieldId) {
  const v = state.vendors.find((x) => x.id === vendorId)
  if (!v) return
  v.extra = v.extra.filter((f) => f.id !== fieldId)
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

export function vendorTotals(vendor) {
  const total = parseMoney(vendor.values.total)
  const deposit = parseMoney(vendor.values.deposit)
  return { total, deposit, left: Math.max(0, total - deposit) }
}

export function summary() {
  let total = 0
  let deposit = 0
  for (const v of state.vendors) {
    const t = vendorTotals(v)
    total += t.total
    deposit += t.deposit
  }
  const budget = parseMoney(state.budget)
  return {
    total,
    deposit,
    left: Math.max(0, total - deposit),
    budget,
    diff: budget - total,
    hasBudget: budget > 0,
    filled: state.vendors.filter((v) => parseMoney(v.values.total) > 0).length,
    count: state.vendors.length,
  }
}

/* ---------------- kopia zapasowa ---------------- */

export function exportData() {
  return JSON.stringify(
    { version: 1, vendors: state.vendors, budget: state.budget, exportedAt: new Date().toISOString() },
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
