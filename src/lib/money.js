/** Parsowanie kwot wpisanych "po ludzku": "12 000,50", "12000.5", "12 tys" -> liczba. */
export function parseMoney(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  if (!input) return 0

  let s = String(input)
    .replace(/[\s  ]/g, '')
    .replace(/[^\d.,-]/g, '')

  if (!s) return 0

  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length

  if (commas && dots) {
    // ostatni separator jest dziesiętny, reszta to tysiące
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (commas) {
    s = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (dots > 1) {
    s = s.replace(/\./g, '')
  }

  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function makeFormatter(digits, currency) {
  const base = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(currency ? { style: 'currency', currency: 'PLN' } : {}),
  }
  try {
    // 'always' grupuje też tysiące w liczbach 4-cyfrowych (6 000 zamiast 6000)
    return new Intl.NumberFormat('pl-PL', { ...base, useGrouping: 'always' })
  } catch {
    return new Intl.NumberFormat('pl-PL', base)
  }
}

const fmtWhole = makeFormatter(0, true)
const fmtCents = makeFormatter(2, true)

/** Pełne złotówki bez końcówki, grosze zawsze na dwóch miejscach. */
export function formatPLN(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return Number.isInteger(n) ? fmtWhole.format(n) : fmtCents.format(n)
}

const decWhole = makeFormatter(0, false)
const decCents = makeFormatter(2, false)

/** Ta sama kwota bez „zł" — do porównania z tym, co wpisał użytkownik. */
export function formatAmount(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return Number.isInteger(n) ? decWhole.format(n) : decCents.format(n)
}
