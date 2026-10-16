<!--
  The landing page's moving picture: one gif at the top and a row of stills under
  it, one per gif. A click on a still fades the top picture out and brings that
  gif in from its first frame; the chosen still is underlined. The gifs are
  fetched from GitHub, where the README keeps them, so they are not in the repo.
-->
<script setup>
import { ref } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps({
  items: { type: Array, required: true },   // [{ key, title, blurb, still, gif, alt }]
})

const current = ref(0)
const fading = ref(false)
const stamp = ref(0)   // bumped on every swap so the gif restarts from its first frame

function pick(i) {
  if (i === current.value) return
  fading.value = true
  setTimeout(() => {
    current.value = i
    stamp.value += 1
    fading.value = false
  }, 180)
}

// a gif that fails to load (GitHub serves the README's attachments, which can be
// slow or refused) falls back to its still, so the page never shows a broken picture
const broken = ref({})
const src = i => broken.value[i] ? withBase(props.items[i].still) : props.items[i].gif + (stamp.value ? '#' + stamp.value : '')
const failed = i => { broken.value = { ...broken.value, [i]: true } }
</script>

<template>
  <div class="swap">
    <div class="swap-top" :class="{ fading }">
      <img :key="stamp + '-' + current" :src="src(current)" :alt="items[current].alt" @error="failed(current)" />
    </div>
    <div class="swap-row">
      <button
        v-for="(it, i) in items"
        :key="it.key"
        type="button"
        class="swap-still"
        :class="{ on: i === current }"
        :aria-pressed="i === current"
        @click="pick(i)"
      >
        <img :src="withBase(it.still)" :alt="it.title" />
        <b>{{ it.title }}</b>
        <span>{{ it.blurb }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.swap {
  margin: 2rem 0 0.5rem;
}

.swap-top {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  transition: opacity 0.18s;
  /* the three gifs have different proportions; the box keeps the widest one's
     height so the row of stills does not jump when the picture changes */
  aspect-ratio: 900 / 506;
  display: flex;
  align-items: center;
  justify-content: center;
}

.swap-top.fading {
  opacity: 0;
}

.swap-top img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  margin: 0;
}

.swap-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 14px;
}

.swap-still {
  font: inherit;
  text-align: left;
  padding: 0 0 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.swap-still img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: top;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  transition: border-color 0.15s, opacity 0.15s;
}

.swap-still:hover img {
  border-color: var(--vp-c-brand-1);
}

.swap-still.on {
  border-bottom-color: var(--vp-c-brand-1);
}

.swap-still.on img {
  border-color: var(--vp-c-brand-1);
}

.swap-still b {
  display: block;
  margin: 10px 0 2px;
  font-family: var(--font-family-display);
  font-size: 1.02rem;
  font-weight: 600;
}

.swap-still span {
  display: block;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--vp-c-text-2);
}

/* on a phone the three stills stay in one row as small thumbnails, so the
   first one does not repeat the big picture right under it */
@media (max-width: 720px) {
  .swap-row { gap: 8px; margin-top: 8px; }
  .swap-still b { font-size: 0.85rem; margin-top: 6px; }
  .swap-still span { display: none; }
}
</style>
