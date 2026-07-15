<script setup lang="ts">
// Galerie-Grid — Items kommen aus dem media-Layer (/api/media):
// subtitle = Aufnahmeort, featured = breite Kachel (früher photos.ts span).
import type { PublicMediaItem } from '../../../../packages/media/shared/types/media'

defineProps<{ items: PublicMediaItem[] }>()
</script>

<template>
  <div class="grid">
    <figure
      v-for="photo in items"
      :key="photo.id"
      class="tile"
      :class="{ 'tile--wide': photo.featured }"
    >
      <img :src="photo.src" :alt="photo.alt" loading="lazy">
      <figcaption class="tile__cap">
        <span class="tile__title">{{ photo.title }}</span>
        <span class="tile__loc">{{ photo.subtitle }}</span>
      </figcaption>
    </figure>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(0.6rem, 1.4vw, 1.1rem);
}
.tile {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  aspect-ratio: 4 / 5;
  background: var(--surface);
}
.tile--wide {
  grid-row: span 2;
  aspect-ratio: 4 / 5;
}
.tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.9s var(--ease), filter 0.6s var(--ease);
}
.tile:hover img {
  transform: scale(1.06);
}
.tile__cap {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 1.2rem 1.3rem;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.72),
    rgba(0, 0, 0, 0) 100%
  );
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.5s var(--ease), transform 0.5s var(--ease);
}
.tile:hover .tile__cap,
.tile:focus-within .tile__cap {
  opacity: 1;
  transform: none;
}
.tile__title {
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.tile__loc {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--accent-soft);
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .tile--wide {
    grid-row: span 1;
  }
}
@media (max-width: 520px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
