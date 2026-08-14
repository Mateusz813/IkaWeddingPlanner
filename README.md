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
- **Przestawianie kafelków i kartek** — złap za uchwyt `⠿` i przeciągnij tam,
  gdzie ma być. Kafelki na kartce, kartki w spisie kartek. Kolejność kafelków
  zapisuje się osobno dla każdej kartki.
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

## Google Sheets jako baza danych

Arkusz trzyma dokładnie to samo, co aplikacja: wszystkie kartki, wszystkie
kafelki, kwoty, terminy, transze, budżet i kolejność.

Synchronizacja działa w obie strony i **nikt niczego nie konfiguruje na telefonie**:

- aplikacja → arkusz: 3 sekundy po ostatniej zmianie, a także przy chowaniu
  aplikacji i po odzyskaniu internetu,
- arkusz → aplikacja: co 12 sekund telefon pyta arkusz, czy coś się zmieniło,
  i pobiera całość dopiero wtedy, gdy tak. Zmiana zrobiona na jednym telefonie
  pojawia się na drugim po kilkunastu sekundach.

Pobieranie jest wstrzymywane, gdy: coś czeka na wysłanie, kursor stoi w polu
tekstowym, albo od własnej zmiany nie minęło 6 sekund. Dzięki temu cudze dane
nie wyrywają tekstu spod palców.

**Ograniczenie:** synchronizowana jest cała zawartość naraz, nie pojedyncze
pola. Jeśli obie osoby zmienią coś w tym samym kilkunastosekundowym oknie,
zostanie wersja tej, która zapisała później.

### Konfiguracja (raz, przez osobę wdrażającą)

Adres skryptu i hasło podaje się jako zmienne środowiskowe przy budowaniu —
patrz [.env.example](.env.example). Lokalnie kopiujesz je do `.env`, a na
Vercelu wpisujesz w **Settings → Environment Variables**:

```
VITE_SHEETS_URL    = https://script.google.com/macros/s/…/exec
VITE_SHEETS_TOKEN  = hasło z linii 18 w Kod.gs
```

Do repozytorium te wartości nie trafiają (`.env` jest ignorowany) — repo jest
publiczne, więc hasło w kodzie dałoby każdemu pełny dostęp do arkusza. W samym
zbudowanym pliku aplikacji oczywiście są, więc chroni je tylko to, że nikt obcy
nie zna adresu aplikacji.

Karta „Google Sheets" w podsumowaniu pokazuje wtedy tylko stan i dwa przyciski
do wymuszenia synchronizacji od ręki. Ręczne wpisywanie adresu jest zapasowym
wyjściem, gdy zmiennych nie ustawiono.

### Instalacja arkusza (raz)

1. Nowy arkusz na `sheets.new`.
2. Rozszerzenia → Apps Script, wklej [`apps-script/Kod.gs`](apps-script/Kod.gs).
3. Zmień `TOKEN` na własne długie hasło.
4. Wdróż → Nowe wdrożenie → Aplikacja internetowa,
   **Wykonaj jako: Ja**, **Kto ma dostęp: Wszyscy**. Skopiuj adres `/exec`.
5. W aplikacji: Podsumowanie → Google Sheets → wklej adres i hasło → Połącz.

Adres i hasło zapisują się w localStorage telefonu, **nie w kodzie aplikacji** —
w publicznym buildzie na Vercelu nie ma żadnego sekretu. Na drugim telefonie
trzeba je wkleić jeszcze raz.

### Arkusze

- `Kartki` — wiersz na kafelek. Kolumny czytelne (`Kartka`, `Pole`, `Wartość`,
  `Termin`, `Zapłacone`), dalej techniczne (identyfikatory, klucz pola, typ,
  numery porządkowe) — te można w Sheets ukryć.
- `Ustawienia` — budżet i znacznik ostatniej zmiany.

Wszystko zapisywane jest jako tekst, żeby Sheets nie przerabiał dat i kwot po
swojemu. Przy ręcznej edycji daty przyjmowane są w obu formatach:
`2026-09-12` i `12.09.2026`.

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
    dragSort.js                przeciąganie palcem (kafelki i kartki)
    sheets.js                  synchronizacja z Google Sheets
    money.js                   parsowanie i formatowanie kwot
    dates.js                   daty ISO bez stref czasowych
    updater.js                 auto-aktualizacja PWA
apps-script/
  Kod.gs                       backend arkusza (wklejany w Apps Script)
```

## Jak liczone są koszty

Na kartkę:

- **kwota podstawowa** — z kafelka „Kwota pełna", a gdy go nie ma lub jest pusty,
  z zaliczki i transz razem (żeby suma nie leciała na zero),
- **koszty dodatkowe** — każdy własny kafelek z kwotą; są doliczane do kwoty
  podstawowej i pokazane w rozbiciu pod kafelkami,
- **zapłacone** — zaliczka plus transze oznaczone jako zapłacone,
- **pozostało** — koszt minus zapłacone.

Transze to harmonogram płatności, a nie dodatkowy koszt — nie podbijają sumy.
Jeśli zaliczka i transze przekroczą „Kwotę pełną", kartka to sygnalizuje.

## Drobiazgi, które łatwo zepsuć

- **Każde pole ma `font-size: 16px`** — przy mniejszej czcionce iOS przybliża
  widok po wejściu w pole i aplikacja „skacze". Etykiety, które mają wyglądać
  na 10px, są 16-punktowe i zmniejszone przez `transform: scale()`.
- Uchwyt przeciągania ma `touch-action: none`, inaczej gest przewracałby kartkę
  albo przewijał treść.
- Przeciągany kafelek zostaje w swoim miejscu w liście (jest tylko wyjęty
  z układu przez `position: absolute`) — przeniesienie węzła w DOM gubi
  przechwycony wskaźnik i przeciąganie urywa się po pierwszym ruchu.
