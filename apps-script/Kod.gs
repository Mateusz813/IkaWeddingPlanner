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
 *  5. Adres wdrożenia trafia do zmiennych środowiskowych aplikacji.
 *
 * Po zmianie kodu: Wdróż → Zarządzaj wdrożeniami → ołówek → Wersja: Nowa.
 * Wtedy adres zostaje ten sam. „Nowe wdrożenie" daje nowy adres.
 *
 * Skrypt NIE zakłada z góry, ile jest kolumn — szerokość bierze z przysłanych
 * danych. Dzięki temu starsza i nowsza wersja aplikacji zapisze się tak samo.
 */

const TOKEN = 'Ikaslub'

const ARKUSZ_DANE = 'Kartki'
const ARKUSZ_USTAWIENIA = 'Ustawienia'

/** Używane tylko, gdy aplikacja nie przyśle własnych nagłówków. */
const NAGLOWKI_DOMYSLNE = [
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

/** Ręczna zmiana w arkuszu podbija znacznik czasu. */
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
  let naglowki = []

  if (arkusz && arkusz.getLastRow() > 0 && arkusz.getLastColumn() > 0) {
    // szerokość i wysokość bierzemy z arkusza, nie z żadnej stałej
    const szerokosc = arkusz.getLastColumn()
    const wysokosc = arkusz.getLastRow()
    const wszystko = arkusz.getRange(1, 1, wysokosc, szerokosc).getValues()

    naglowki = wszystko[0].map(function (k) {
      return k === null || k === undefined ? '' : String(k)
    })

    wiersze = wszystko
      .slice(1)
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
    columns: naglowki,
    rows: wiersze,
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

    const naglowki = (body.columns && body.columns.length ? body.columns : NAGLOWKI_DOMYSLNE).map(String)
    const dane = body.rows || []

    // Szerokość = najszerszy wiersz albo nagłówki. Nigdy nie polegamy na stałej,
    // bo niezgodność szerokości wysadzała cały zapis.
    let szerokosc = naglowki.length
    for (let i = 0; i < dane.length; i++) {
      if (dane[i] && dane[i].length > szerokosc) szerokosc = dane[i].length
    }
    if (szerokosc < 1) szerokosc = 1

    const wyrownaj = function (wiersz) {
      const out = []
      for (let i = 0; i < szerokosc; i++) {
        const k = wiersz && wiersz[i]
        out.push(k === null || k === undefined ? '' : String(k))
      }
      return out
    }

    const wiersze = [wyrownaj(naglowki)]
    for (let i = 0; i < dane.length; i++) wiersze.push(wyrownaj(dane[i]))

    arkusz.clear()
    const zakres = arkusz.getRange(1, 1, wiersze.length, szerokosc)
    // wszystko jako tekst — inaczej Sheets przerabia daty i kwoty po swojemu
    zakres.setNumberFormat('@')
    zakres.setValues(wiersze)

    arkusz.getRange(1, 1, 1, szerokosc).setFontWeight('bold').setBackground('#FBEEEA')
    arkusz.setFrozenRows(1)
    arkusz.autoResizeColumns(1, Math.min(5, szerokosc))

    zapiszUstawienie(ss, 'Budżet', body.budget || '')
    zapiszUstawienie(ss, 'Zmieniono', body.updatedAt || new Date().toISOString())

    return { ok: true, rows: dane.length, columns: szerokosc, updatedAt: body.updatedAt }
  } finally {
    lock.releaseLock()
  }
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
