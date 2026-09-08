<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/** Dzień ślubu: 27 sierpnia 2027, liczone od północy czasu lokalnego. */
const SLUB = new Date(2027, 7, 27, 0, 0, 0, 0)

const teraz = ref(Date.now())
let timer = null

function tik() {
  teraz.value = Date.now()
}

onMounted(() => {
  // odświeżamy też po powrocie do aplikacji — w tle przeglądarka dławi zegary
  document.addEventListener('visibilitychange', tik)
  timer = setInterval(tik, 1000)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', tik)
  clearInterval(timer)
})

const zostalo = computed(() => Math.max(0, SLUB.getTime() - teraz.value))

const czesci = computed(() => {
  const s = Math.floor(zostalo.value / 1000)
  return {
    dni: Math.floor(s / 86400),
    godziny: Math.floor((s % 86400) / 3600),
    minuty: Math.floor((s % 3600) / 60),
    sekundy: s % 60,
  }
})

const pad = (n) => String(n).padStart(2, '0')

/** „za 3 dni" po polsku: 2–4 → „dni", reszta → „dni"; liczba i tak jest obok. */
const zegar = computed(() => {
  const { godziny, minuty, sekundy } = czesci.value
  return `${pad(godziny)}:${pad(minuty)}:${pad(sekundy)}`
})

const trwaDzien = computed(() => {
  const koniecDnia = SLUB.getTime() + 24 * 60 * 60 * 1000
  return teraz.value >= SLUB.getTime() && teraz.value < koniecDnia
})

const poSlubie = computed(() => teraz.value >= SLUB.getTime() + 24 * 60 * 60 * 1000)
</script>

<template>
  <span v-if="trwaDzien" class="odl odl--dzis">Dziś nasz ślub ♥</span>
  <span v-else-if="poSlubie" class="odl odl--dzis">Mąż i żona ♥</span>
  <span v-else class="odl" :aria-label="`Do ślubu ${czesci.dni} dni ${zegar}`">
    <strong>{{ czesci.dni }}</strong> dni
    <span class="odl__zegar">{{ zegar }}</span>
  </span>
</template>

<style scoped>
.odl {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 3px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-faint);
  white-space: nowrap;
}

.odl strong {
  font-size: 11px;
  color: var(--blush);
}

.odl__zegar {
  /* cyfry o stałej szerokości — inaczej napis drga co sekundę */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: var(--gold);
}

.odl--dzis {
  color: var(--blush);
  letter-spacing: 0.12em;
}
</style>
