/**
 * Baza danych planera ślubnego I & M.
 *
 * Instalacja:
 *  1. W arkuszu: Rozszerzenia → Apps Script.
 *  2. Wklej ten plik w miejsce tego, co tam jest.
 *  3. Zmień TOKEN poniżej na własne, długie hasło.
 *  4. Wdróż → Nowe wdrożenie → typ: Aplikacja internetowa
 *     - Wykonaj jako: Ja
 *     - Kto ma dostęp: Wszyscy
 *  5. Skopiuj adres wdrożenia i wklej go razem z tokenem w aplikacji
 *     (Podsumowanie → Synchronizacja).
 *
 * Po każdej zmianie kodu trzeba zrobić NOWE wdrożenie (albo edytować istniejące
 * i podbić wersję) — inaczej działa stara wersja skryptu.
 */

const TOKEN = 'zmien-to-na-wlasne-dlugie-haslo'

const ARKUSZ_DANE = 'Kartki'
const ARKUSZ_USTAWIENIA = 'Ustawienia'
const ARKUSZ_USUNIETE = 'Usuniete'

const NAGLOWKI = [
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

/** Aplikacja rozmawia ze skryptem wyłącznie przez POST — token nie ląduje w adresie. */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    if (body.token !== TOKEN) return odpowiedz({ error: 'Zły token' })

    // 'stamp' to tani odczyt samego znacznika czasu — telefony pytają o niego
    // co kilkanaście sekund i pobierają całość dopiero, gdy coś się zmieniło
    if (body.action === 'stamp') return odpowiedz({ updatedAt: znacznik() })
    if (body.action === 'read') return odpowiedz(czytaj())
    if (body.action === 'write') return odpowiedz(zapisz(body))
    return odpowiedz({ error: 'Nieznana akcja: ' + body.action })
  } catch (err) {
    return odpowiedz({ error: String(err) })
  }
}

function doGet() {
  return odpowiedz({ ok: true, info: 'Planer I & M — ten adres obsługuje POST.' })
}

/** Ręczna zmiana w arkuszu podbija znacznik czasu, żeby aplikacja wiedziała, że ma pobrać dane. */
function onEdit(e) {
  const arkusz = e.range.getSheet()
  if (arkusz.getName() !== ARKUSZ_DANE) return
  zapiszUstawienie(e.source, 'Zmieniono', new Date().toISOString())
}

function znacznik() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  return czytajUstawienia(ss, ss.getSpreadsheetTimeZone())['Zmieniono'] || ''
}

function czytaj() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const strefa = ss.getSpreadsheetTimeZone()
  const arkusz = ss.getSheetByName(ARKUSZ_DANE)

  let wiersze = []
  if (arkusz && arkusz.getLastRow() > 1) {
    wiersze = arkusz
      .getRange(2, 1, arkusz.getLastRow() - 1, NAGLOWKI.length)
      .getValues()
      .map(function (wiersz) {
        return wiersz.map(function (komorka) {
          // Sheets potrafi zamienić „2026-09-12" na datę — wracamy do tekstu
          if (komorka instanceof Date) return Utilities.formatDate(komorka, strefa, 'yyyy-MM-dd')
          return komorka === null || komorka === undefined ? '' : String(komorka)
        })
      })
      .filter(function (wiersz) {
        return wiersz.some(function (komorka) {
          return komorka !== ''
        })
      })
  }

  const ustawienia = czytajUstawienia(ss, strefa)
  return {
    rows: wiersze,
    deleted: czytajUsuniete(ss, strefa),
    budget: ustawienia['Budżet'] || '',
    updatedAt: ustawienia['Zmieniono'] || '',
  }
}

function zapisz(body) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const arkusz = daj(ss, ARKUSZ_DANE)
    const wiersze = [NAGLOWKI].concat(body.rows || [])

    arkusz.clear()
    const zakres = arkusz.getRange(1, 1, wiersze.length, NAGLOWKI.length)
    // wszystko jako tekst — inaczej Sheets przerabia daty i kwoty po swojemu
    zakres.setNumberFormat('@')
    zakres.setValues(wiersze)

    arkusz.getRange(1, 1, 1, NAGLOWKI.length).setFontWeight('bold').setBackground('#FBEEEA')
    arkusz.setFrozenRows(1)
    arkusz.autoResizeColumns(1, 5)

    zapiszUsuniete(ss, body.deleted || {})
    zapiszUstawienie(ss, 'Budżet', body.budget || '')
    zapiszUstawienie(ss, 'Zmieniono', body.updatedAt || new Date().toISOString())

    return { ok: true, updatedAt: body.updatedAt, rows: (body.rows || []).length }
  } finally {
    lock.releaseLock()
  }
}

/** Skasowane kartki i kafelki: id → kiedy. Bez tego wracałyby przy scalaniu. */
function czytajUsuniete(ss, strefa) {
  const arkusz = ss.getSheetByName(ARKUSZ_USUNIETE)
  const wynik = {}
  if (!arkusz || arkusz.getLastRow() < 2) return wynik

  arkusz
    .getRange(2, 1, arkusz.getLastRow() - 1, 2)
    .getValues()
    .forEach(function (wiersz) {
      const id = String(wiersz[0] || '').trim()
      if (!id) return
      const kiedy = wiersz[1]
      wynik[id] =
        kiedy instanceof Date
          ? Utilities.formatDate(kiedy, strefa, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
          : String(kiedy || '')
    })
  return wynik
}

function zapiszUsuniete(ss, mapa) {
  const arkusz = daj(ss, ARKUSZ_USUNIETE)
  const wiersze = [['id', 'kiedy']]
  Object.keys(mapa).forEach(function (id) {
    wiersze.push([id, String(mapa[id] || '')])
  })

  arkusz.clear()
  const zakres = arkusz.getRange(1, 1, wiersze.length, 2)
  zakres.setNumberFormat('@')
  zakres.setValues(wiersze)
  arkusz.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#FBEEEA')
  arkusz.setFrozenRows(1)
}

function czytajUstawienia(ss, strefa) {
  const arkusz = ss.getSheetByName(ARKUSZ_USTAWIENIA)
  const wynik = {}
  if (!arkusz || arkusz.getLastRow() < 1) return wynik

  arkusz
    .getRange(1, 1, arkusz.getLastRow(), 2)
    .getValues()
    .forEach(function (wiersz) {
      const klucz = String(wiersz[0] || '').trim()
      if (!klucz) return
      const wartosc = wiersz[1]
      wynik[klucz] =
        wartosc instanceof Date
          ? Utilities.formatDate(wartosc, strefa, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
          : String(wartosc === null || wartosc === undefined ? '' : wartosc)
    })
  return wynik
}

function zapiszUstawienie(ss, klucz, wartosc) {
  const arkusz = daj(ss, ARKUSZ_USTAWIENIA)
  const ostatni = arkusz.getLastRow()

  if (ostatni > 0) {
    const klucze = arkusz.getRange(1, 1, ostatni, 1).getValues()
    for (let i = 0; i < klucze.length; i++) {
      if (String(klucze[i][0]).trim() === klucz) {
        arkusz.getRange(i + 1, 2).setNumberFormat('@').setValue(wartosc)
        return
      }
    }
  }

  arkusz
    .getRange(ostatni + 1, 1, 1, 2)
    .setNumberFormat('@')
    .setValues([[klucz, wartosc]])
}

function daj(ss, nazwa) {
  return ss.getSheetByName(nazwa) || ss.insertSheet(nazwa)
}

function odpowiedz(dane) {
  return ContentService.createTextOutput(JSON.stringify(dane)).setMimeType(ContentService.MimeType.JSON)
}
