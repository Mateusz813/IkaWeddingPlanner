/** Data jako YYYY-MM-DD, zawsze lokalnie — bez stref czasowych. */
export function toISO(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseISO(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''))
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function isoToday() {
  return toISO(new Date())
}

/** „14.08.2026" — krótko, żeby mieściło się w wąskim kafelku. */
export function formatDateShort(text) {
  const date = parseISO(text)
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

/** „14 sierpnia 2026" — do miejsc, gdzie jest więcej luzu. */
export function formatDateLong(text) {
  const date = parseISO(text)
  if (!date) return ''
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}
