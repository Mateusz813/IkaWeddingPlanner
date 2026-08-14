# I & M — Planer Ślubny

Aplikacja na telefon do planowania ślubu i wesela. Każdy usługodawca to osobna
kartka, którą przewraca się jak w książce. Wszystkie dane trzymane są lokalnie
w przeglądarce (localStorage) — nic nie wychodzi na zewnątrz.

## Co potrafi

- **Kartki usługodawców** — jedna strona = jeden usługodawca, przewracane
  gestem (przeciągnij palcem) albo strzałkami. Animacja obrotu 3D.
- **Kafelki** — na każdej kartce gotowe pola: nazwa, kwota pełna, zaliczka,
  status, terminy, osoba kontaktowa, dwa telefony, e-mail, strona, adres,
  notatki. Można dorzucić własne (`+ Dodaj kafelek`), skasować niepotrzebne
  i przywrócić skasowane.
- **Przestawianie kafelków** — złap kafelek za uchwyt `⠿` i przeciągnij tam,
  gdzie ma być. Kolejność zapisuje się osobno dla każdej kartki.
- **Transze** — kafelek „Transza / rata": kwota, własny termin i znacznik
  zapłaty. Można ich dodać dowolnie wiele (np. 3 transze za salę, każda z innym
  terminem). Zapłacone transze wliczają się do „już zapłacone" razem z zaliczką.
- **Własny kalendarz** — daty wybiera się z kalendarza w kolorystyce aplikacji,
  nie z systemowego okienka przeglądarki.
- **Podsumowanie kosztów** — przycisk w prawym górnym rogu. Suma wszystkiego,
  wpłacone zaliczki, pozostało do zapłaty, budżet i koszty kartka po kartce.
- **Dodawanie kartek** — `+` w lewym górnym rogu albo `+ Dodaj nową kartkę`
  w spisie kartek. Nowa kartka ląduje zaraz za obecną.
- **Spis kartek** — licznik `3 / 18` na dole otwiera listę wszystkich kartek
  z możliwością skoku i zmiany kolejności.
- **PWA** — dodaj do ekranu głównego i działa jak zwykła aplikacja, też offline.
- **Auto-aktualizacja** — po wgraniu nowej wersji aplikacja na telefonie sama
  się podmienia. Nie trzeba nic pobierać ani tworzyć skrótu od nowa.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Aplikacja startuje na **porcie 5899**: http://localhost:5899
(`--host` jest włączony, więc z telefonu w tej samej sieci wejdziesz też przez
adres IP komputera, np. `http://192.168.0.12:5899`).

Podgląd wersji produkcyjnej (z działającym service workerem):

```bash
npm run build && npm run preview
```

## Wdrożenie

Projekt jest przygotowany pod Vercel (`vercel.json`). Każdy push na `main`
buduje i publikuje nową wersję, a telefony z otwartą aplikacją zaktualizują się
same w ciągu minuty.

## Jak działa auto-aktualizacja

- `vite-plugin-pwa` w trybie `autoUpdate` generuje service workera przy każdym
  buildzie.
- `src/lib/updater.js` co minutę (oraz po powrocie do aplikacji i po odzyskaniu
  internetu) sprawdza, czy jest nowa wersja.
- Gdy nowy service worker przejmie stronę, aplikacja przeładowuje się sama.
  Pierwsze uruchomienie jest z tego wyłączone, żeby nie przeładowywać na starcie.
- `vercel.json` pilnuje, żeby `sw.js`, `index.html` i manifest nie były
  cache'owane na sztywno — inaczej telefon nie zauważyłby nowej wersji.

## Dane i kopia zapasowa

Kartka to jedna lista bloków (`vendor.blocks`) — dzięki temu każdy kafelek da
się przestawić. Blok stały trzyma tylko `key` i wartość (etykieta i typ biorą
się z `FIELD_DEFS`), blok własny trzyma etykietę i typ u siebie. Starszy zapis
(`values` + `extra`) jest przy wczytaniu automatycznie przenoszony na ten model.

Dane siedzą w localStorage pod kluczem `ika-wedding-planner/v1`. Wyczyszczenie
danych przeglądarki je usunie, dlatego w podsumowaniu na dole jest sekcja
**Kopia zapasowa** — `Zapisz kopię` pobiera plik JSON, `Wczytaj kopię` go
przywraca.

## Struktura

```
src/
  App.vue                      górny pasek + przełączanie widoków
  components/
    BookView.vue               książka: obrót kartki 3D, gesty, nawigacja
    VendorPage.vue             kartka usługodawcy + przeciąganie kafelków
    BrickField.vue             pojedynczy kafelek (w tym transza)
    DateSheet.vue              kalendarz w kolorystyce aplikacji
    SummaryView.vue            podsumowanie kosztów i kopia zapasowa
    PageIndexSheet.vue         spis kartek
  lib/
    store.js                   stan + zapis do localStorage
    money.js                   parsowanie i formatowanie kwot
    dates.js                   daty ISO bez stref czasowych
    updater.js                 auto-aktualizacja PWA
```

## Drobiazgi, które łatwo zepsuć

- **Każde pole ma `font-size: 16px`** — przy mniejszej czcionce iOS przybliża
  widok po wejściu w pole i aplikacja „skacze". Etykiety, które mają wyglądać
  na 10px, są 16-punktowe i zmniejszone przez `transform: scale()`.
- Uchwyt przeciągania ma `touch-action: none`, inaczej gest przewracałby kartkę
  albo przewijał treść.
- Przeciągany kafelek zostaje w swoim miejscu w liście (jest tylko wyjęty
  z układu przez `position: absolute`) — przeniesienie węzła w DOM gubi
  przechwycony wskaźnik i przeciąganie urywa się po pierwszym ruchu.
