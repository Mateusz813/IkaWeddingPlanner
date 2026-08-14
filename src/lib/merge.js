/**
 * Scalanie danych z dwóch telefonów pole po polu.
 *
 * Każdy kafelek i każda kartka niosą własny znacznik czasu `at`, ustawiany przy
 * zmianie. Przy scalaniu wygrywa nowsza wersja — dzięki temu zmiana nazwy u
 * jednej osoby nie kasuje kwoty wpisanej w tym samym czasie przez drugą.
 *
 * Kasowanie zapisujemy osobno (nagrobki: id → kiedy), bo inaczej skasowany
 * kafelek wracałby z kopii drugiego telefonu.
 *
 * Kolejność kafelków nie jest scalana — trzymamy tę z telefonu, a rzeczy
 * dodane przez drugą osobę dokładamy na koniec.
 */

const NIGDY = ''

function nowszy(a, b) {
  return (a || NIGDY) >= (b || NIGDY)
}

/** Czy element został skasowany później, niż ostatnio zmieniony. */
function skasowany(tombstones, id, at) {
  const kiedy = tombstones[id]
  return !!kiedy && kiedy > (at || NIGDY)
}

function mergeBlocks(local = [], remote = [], tombstones) {
  const remoteById = new Map(remote.map((b) => [b.id, b]))
  const localIds = new Set(local.map((b) => b.id))
  const out = []

  for (const block of local) {
    if (skasowany(tombstones, block.id, block.at)) continue
    const other = remoteById.get(block.id)
    if (!other) {
      out.push(block)
      continue
    }
    out.push(nowszy(block.at, other.at) ? block : { ...other })
  }

  // kafelki, których ten telefon nie zna — dodane przez drugą osobę
  for (const block of remote) {
    if (localIds.has(block.id)) continue
    if (skasowany(tombstones, block.id, block.at)) continue
    out.push({ ...block })
  }

  return out
}

/**
 * @param {Array} local    kartki z telefonu
 * @param {Array} remote   kartki z arkusza
 * @param {Object} tombstones  { id: znacznikCzasuKasowania }
 */
export function mergeVendors(local = [], remote = [], tombstones = {}) {
  const remoteById = new Map(remote.map((v) => [v.id, v]))
  const localIds = new Set(local.map((v) => v.id))
  const out = []

  for (const vendor of local) {
    if (skasowany(tombstones, vendor.id, vendor.at)) continue
    const other = remoteById.get(vendor.id)
    if (!other) {
      out.push(vendor)
      continue
    }
    const nowszaNazwa = nowszy(vendor.at, other.at)
    out.push({
      id: vendor.id,
      title: nowszaNazwa ? vendor.title : other.title,
      at: nowszaNazwa ? vendor.at : other.at,
      blocks: mergeBlocks(vendor.blocks, other.blocks, tombstones),
    })
  }

  for (const vendor of remote) {
    if (localIds.has(vendor.id)) continue
    if (skasowany(tombstones, vendor.id, vendor.at)) continue
    out.push({ ...vendor, blocks: mergeBlocks([], vendor.blocks, tombstones) })
  }

  return out
}

/** Łączy dwie listy skasowanych, zostawiając późniejszy znacznik. */
export function mergeTombstones(a = {}, b = {}) {
  const out = { ...a }
  for (const [id, kiedy] of Object.entries(b)) {
    if (!out[id] || kiedy > out[id]) out[id] = kiedy
  }
  return out
}

/** Wyrzuca nagrobki starsze niż `dni` — inaczej rosłyby bez końca. */
export function pruneTombstones(tombstones = {}, dni = 60) {
  const granica = new Date(Date.now() - dni * 24 * 60 * 60 * 1000).toISOString()
  const out = {}
  for (const [id, kiedy] of Object.entries(tombstones)) {
    if (kiedy > granica) out[id] = kiedy
  }
  return out
}
