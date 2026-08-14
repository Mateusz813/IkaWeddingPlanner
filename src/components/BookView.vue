<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import VendorPage from './VendorPage.vue'
import { setIndex, state } from '../lib/store.js'

const emit = defineEmits(['open-index'])

const bookEl = ref(null)

/** null albo { dir: 'next' | 'prev', from: number, to: number } */
const flip = ref(null)
/** Kąt obrotu kartki: 0 = leży płasko, -180 = przewrócona na lewą stronę. */
const angle = ref(0)
const nudge = ref('')

const count = computed(() => state.vendors.length)
const index = computed(() => state.index)

const baseIdx = computed(() => {
  if (!flip.value) return index.value
  return flip.value.dir === 'next' ? flip.value.to : flip.value.from
})

const flipIdx = computed(() => {
  if (!flip.value) return index.value
  return flip.value.dir === 'next' ? flip.value.from : flip.value.to
})

const basePage = computed(() => state.vendors[baseIdx.value])
const flipPage = computed(() => state.vendors[flipIdx.value])

const absAngle = computed(() => Math.abs(angle.value))

/**
 * Obrót wokół lewej krawędzi zbliża prawy brzeg kartki do oka, więc perspektywa
 * ją powiększa i kartka wychodzi poza książkę. Cofamy ją częściowo w głąb:
 * pełne cofnięcie odklejałoby grzbiet od krawędzi, brak cofnięcia zasłaniałby
 * nagłówek. Resztę przycina .book-clip.
 */
const PUSH_BACK = 0.4
const bookWidth = ref(360)

const flipTransform = computed(() => {
  const deg = angle.value
  const push = bookWidth.value * Math.abs(Math.sin((deg * Math.PI) / 180)) * PUSH_BACK
  return `translateZ(${(-push).toFixed(1)}px) rotateY(${deg.toFixed(2)}deg)`
})
const frontShade = computed(() => (flip.value ? Math.min(1, absAngle.value / 90) * 0.5 : 0))
const backShade = computed(() => (flip.value ? Math.min(1, (180 - absAngle.value) / 90) * 0.45 : 0))
const baseShade = computed(() => (flip.value ? Math.sin((absAngle.value / 180) * Math.PI) * 0.38 : 0))

const canPrev = computed(() => index.value > 0)
const canNext = computed(() => index.value < count.value - 1)

/* ---------------- animacja ---------------- */

let rafId = 0
let guardId = 0
let animating = false
/** Domyka trwającą animację natychmiast (szybkie stukanie w strzałki). */
let completeNow = null

function cancelAnim() {
  if (rafId) cancelAnimationFrame(rafId)
  clearTimeout(guardId)
  rafId = 0
  guardId = 0
  animating = false
  completeNow = null
}

function animate(to, duration, done) {
  cancelAnim()
  const from = angle.value
  if (from === to) {
    done()
    return
  }

  const start = performance.now()
  animating = true
  let finished = false

  const complete = () => {
    if (finished) return
    finished = true
    if (rafId) cancelAnimationFrame(rafId)
    clearTimeout(guardId)
    rafId = 0
    guardId = 0
    animating = false
    completeNow = null
    angle.value = to
    done()
  }
  completeNow = complete

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    angle.value = from + (to - from) * e
    if (t < 1) rafId = requestAnimationFrame(step)
    else complete()
  }

  rafId = requestAnimationFrame(step)
  // Gdyby requestAnimationFrame został wstrzymany (apka w tle, karta nieaktywna),
  // kartka nie może zostać w połowie obrotu — dociągamy ją zegarem.
  guardId = setTimeout(complete, duration + 350)
}

function settle(commit) {
  if (!flip.value) return
  const { dir, to } = flip.value
  const target = commit ? (dir === 'next' ? -180 : 0) : dir === 'next' ? 0 : -180
  const remaining = Math.abs(target - angle.value) / 180
  animate(target, Math.max(200, 640 * remaining), () => {
    if (commit) setIndex(to)
    flip.value = null
    angle.value = 0
  })
}

function begin(dir, to) {
  cancelAnim()
  flip.value = { dir, from: state.index, to }
  angle.value = dir === 'next' ? 0 : -180
}

function bounce(side) {
  if (nudge.value) return
  nudge.value = side
  setTimeout(() => (nudge.value = ''), 420)
}

/** Przewróć o jedną kartkę przyciskiem. */
function turn(dir) {
  // szybkie stukanie: domknij bieżące przewracanie i od razu leć dalej
  if (animating) completeNow?.()
  if (flip.value || drag) return
  if (dir === 'next' && !canNext.value) return bounce('next')
  if (dir === 'prev' && !canPrev.value) return bounce('prev')
  begin(dir, dir === 'next' ? index.value + 1 : index.value - 1)
  nextTick(() => settle(true))
}

/** Skok do dowolnej kartki — też z animacją przewracania. */
function goTo(target) {
  if (animating) completeNow?.()
  if (flip.value || drag) return
  if (target === index.value || target < 0 || target >= count.value) return
  begin(target > index.value ? 'next' : 'prev', target)
  nextTick(() => settle(true))
}

defineExpose({ goTo, turn })

/* ---------------- gesty ---------------- */

const DRAG_THRESHOLD = 10
let drag = null

function isInteractive(target) {
  return !!(target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable]'))
}

function onPointerDown(event) {
  if (animating || flip.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (isInteractive(event.target)) return
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    axis: null,
    lastX: event.clientX,
    lastT: event.timeStamp,
    velocity: 0,
  }
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return

  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y

  if (!drag.axis) {
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    if (Math.abs(dy) >= Math.abs(dx)) {
      drag = null // pionowo = scroll treści kartki
      return
    }
    drag.axis = 'x'
    const dir = dx < 0 ? 'next' : 'prev'
    if ((dir === 'next' && !canNext.value) || (dir === 'prev' && !canPrev.value)) {
      bounce(dir)
      drag = null
      return
    }
    // start liczymy od progu, żeby kartka nie „przeskoczyła"
    drag.x = event.clientX + (dx < 0 ? DRAG_THRESHOLD : -DRAG_THRESHOLD)
    drag.dir = dir
    begin(dir, dir === 'next' ? index.value + 1 : index.value - 1)
    bookEl.value?.setPointerCapture?.(event.pointerId)
  }

  const dt = event.timeStamp - drag.lastT
  if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt
  drag.lastX = event.clientX
  drag.lastT = event.timeStamp

  const width = bookEl.value?.clientWidth || 1
  const moved = event.clientX - drag.x
  const p = Math.min(1, Math.max(0, (drag.dir === 'next' ? -moved : moved) / width))
  angle.value = drag.dir === 'next' ? -180 * p : -180 + 180 * p
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return
  const current = drag
  drag = null
  if (current.axis !== 'x' || !flip.value) return

  const p = current.dir === 'next' ? absAngle.value / 180 : 1 - absAngle.value / 180
  const flung = current.dir === 'next' ? current.velocity < -0.45 : current.velocity > 0.45
  const stalled = current.dir === 'next' ? current.velocity > 0.45 : current.velocity < -0.45
  settle(!stalled && (p > 0.38 || flung))
}

function onPointerCancel() {
  if (!drag) return
  const wasDragging = drag.axis === 'x'
  drag = null
  if (wasDragging && flip.value) settle(false)
}

/* ---------------- klawiatura (wygoda na desktopie) ---------------- */

function onKey(event) {
  if (isInteractive(event.target)) return
  if (event.key === 'ArrowLeft') turn('prev')
  if (event.key === 'ArrowRight') turn('next')
}

/* ---------------- pomiary ---------------- */

function measure() {
  const w = bookEl.value?.clientWidth
  if (w) bookWidth.value = w
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  window.addEventListener('orientationchange', measure)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('orientationchange', measure)
  window.removeEventListener('keydown', onKey)
  cancelAnim()
})
</script>

<template>
  <div class="bookwrap">
    <div class="book-clip">
      <div
        ref="bookEl"
        class="book"
        :class="{ 'is-flipping': !!flip, [`nudge-${nudge}`]: !!nudge }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
        <!-- grzbiet i cienie kartek pod spodem -->
        <div class="book__stack" aria-hidden="true"></div>

        <div class="leaf leaf--base">
          <VendorPage
            v-if="basePage"
            :key="basePage.id"
            :vendor="basePage"
            :position="baseIdx"
            :count="count"
            :inert="!!flip"
          />
          <div class="shade shade--base" :style="{ opacity: baseShade }" aria-hidden="true"></div>
        </div>

        <div v-if="flip" class="leaf leaf--flipper" :style="{ transform: flipTransform }">
          <div class="face face--front">
            <VendorPage v-if="flipPage" :vendor="flipPage" :position="flipIdx" :count="count" inert />
            <div class="shade shade--front" :style="{ opacity: frontShade }" aria-hidden="true"></div>
          </div>
          <div class="face face--back">
            <div class="back">
              <div class="back__mono">I <em>&amp;</em> M</div>
              <div class="ornament"><span>♥</span></div>
            </div>
            <div class="shade shade--back" :style="{ opacity: backShade }" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>

    <nav class="nav">
      <button class="nav__arrow" type="button" :disabled="!canPrev" aria-label="Poprzednia kartka" @click="turn('prev')">
        ‹
      </button>

      <button class="nav__pos" type="button" @click="emit('open-index')">
        <span class="nav__pos-num">{{ index + 1 }} / {{ count }}</span>
        <span class="nav__pos-label">spis kartek</span>
      </button>

      <button class="nav__arrow" type="button" :disabled="!canNext" aria-label="Następna kartka" @click="turn('next')">
        ›
      </button>
    </nav>
  </div>
</template>

<style scoped>
.bookwrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Kadruje przewracaną kartkę, żeby nigdy nie weszła na nagłówek ani na nawigację.
   Padding zostawia miejsce na cienie kartki i stosu pod spodem. */
.book-clip {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 8px 10px 18px;
}

.book {
  position: relative;
  height: 100%;
  margin: 0 2px;
  perspective: 2400px;
  perspective-origin: 55% 45%;
  touch-action: pan-y;
}

/* kartki „pod spodem" — daje wrażenie książki */
.book__stack {
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  background: var(--cream-deep);
  box-shadow:
    3px 5px 0 -1px rgba(240, 230, 218, 0.9),
    6px 10px 0 -2px rgba(233, 221, 207, 0.85),
    9px 15px 0 -3px rgba(226, 212, 196, 0.7),
    0 24px 40px -22px rgba(58, 51, 48, 0.55);
}

.leaf {
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
}

.leaf--base {
  overflow: hidden;
  box-shadow: var(--shadow-page);
}

.leaf--flipper {
  transform-origin: left center;
  transform-style: preserve-3d;
  will-change: transform;
  pointer-events: none;
}

.face {
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  overflow: hidden;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow: var(--shadow-page);
  background: var(--paper);
}

.face--back {
  transform: rotateY(180deg);
}

.shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: var(--radius);
}

.shade--front {
  background: linear-gradient(90deg, rgba(60, 45, 35, 0.85) 0%, rgba(60, 45, 35, 0.28) 45%, rgba(60, 45, 35, 0.1) 100%);
}

.shade--back {
  background: linear-gradient(270deg, rgba(60, 45, 35, 0.8) 0%, rgba(60, 45, 35, 0.25) 55%, rgba(60, 45, 35, 0.08) 100%);
}

.shade--base {
  background: linear-gradient(90deg, rgba(45, 33, 26, 0.9) 0%, rgba(45, 33, 26, 0.35) 22%, rgba(45, 33, 26, 0) 55%);
}

/* rewers kartki */
.back {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: linear-gradient(180deg, #fffdf9 0%, #f8f0e7 100%);
  background-image: repeating-linear-gradient(
      -45deg,
      rgba(200, 162, 74, 0.05) 0 2px,
      rgba(200, 162, 74, 0) 2px 9px
    ),
    linear-gradient(180deg, #fffdf9 0%, #f8f0e7 100%);
}

.back::after {
  content: '';
  position: absolute;
  inset: 0;
  /* grzbiet jest teraz po prawej — kartka jest odwrócona */
  background: linear-gradient(270deg, rgba(200, 162, 74, 0.16) 0 12px, rgba(200, 162, 74, 0) 12px);
}

.back__mono {
  font-family: var(--font-display);
  font-size: 52px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #e2d3c1;
}

.back__mono em {
  font-style: italic;
  color: var(--blush-soft);
}

/* delikatne „nie da się dalej" */
@keyframes nudge-next {
  0%,
  100% {
    transform: translateX(0);
  }
  35% {
    transform: translateX(-12px) rotate(-0.35deg);
  }
  70% {
    transform: translateX(4px);
  }
}

@keyframes nudge-prev {
  0%,
  100% {
    transform: translateX(0);
  }
  35% {
    transform: translateX(12px) rotate(0.35deg);
  }
  70% {
    transform: translateX(-4px);
  }
}

.nudge-next {
  animation: nudge-next 0.42s ease;
}

.nudge-prev {
  animation: nudge-prev 0.42s ease;
}

/* ---------- nawigacja ---------- */

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 22px calc(8px + var(--safe-bottom));
  flex: none;
}

.nav__arrow {
  width: 52px;
  height: 44px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--paper-edge);
  color: var(--blush);
  font-size: 26px;
  line-height: 1;
  padding-bottom: 4px;
  box-shadow: 0 6px 14px -10px rgba(58, 51, 48, 0.8);
  transition: transform 0.12s ease, opacity 0.2s ease;
}

.nav__arrow:active:not(:disabled) {
  transform: scale(0.92);
}

.nav__arrow:disabled {
  opacity: 0.32;
  color: var(--ink-faint);
}

.nav__pos {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 16px;
  border-radius: 12px;
}

.nav__pos-num {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  color: var(--ink-soft);
}

.nav__pos-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

@media (prefers-reduced-motion: reduce) {
  .nudge-next,
  .nudge-prev {
    animation: none;
  }
}
</style>
