<template>
  <!-- Minimal-Layout fürs iframe-Embed: kein Nav/Footer/UserMenu/Bell —
       nur die Section; Padding klein, damit das Widget dicht an der
       Hostseite sitzt. Hintergrund transparent (Seite setzt bodyAttrs). -->
  <div class="p-2">
    <slot />
  </div>
</template>
