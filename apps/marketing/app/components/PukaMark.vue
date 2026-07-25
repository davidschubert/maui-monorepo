<script setup lang="ts">
// Das Marken-Zeichen: die *puka* — eine kreisförmige Lichtöffnung, durch die
// die Sonne bricht. Dekorativ (aria-hidden); der Wortlaut steht daneben.
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <svg
    :style="{ width: `${size}px`, height: `${size}px` }" viewBox="0 0 32 32" fill="none"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="puka-mark"
  >
    <defs>
      <radialGradient id="pukaSun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="hsl(40 98% 66%)" />
        <stop offset="70%" stop-color="hsl(32 94% 54%)" />
        <stop offset="100%" stop-color="hsl(26 90% 48%)" />
      </radialGradient>
    </defs>
    <!-- Wolkenring (die Öffnung) -->
    <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" opacity="0.28" />
    <!-- die Sonne im Loch -->
    <circle cx="16" cy="16" r="7.5" fill="url(#pukaSun)" />
    <!-- Strahlen, die durchbrechen -->
    <g stroke="url(#pukaSun)" stroke-width="2" stroke-linecap="round" opacity="0.9">
      <line x1="16" y1="1.5" x2="16" y2="5" />
      <line x1="16" y1="27" x2="16" y2="30.5" />
      <line x1="1.5" y1="16" x2="5" y2="16" />
      <line x1="27" y1="16" x2="30.5" y2="16" />
    </g>
  </svg>
</template>
