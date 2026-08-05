<script setup lang="ts">
/**
 * DIE Schreibfläche für einen Beitragstext — einmal, für alle Stellen.
 *
 * Warum eine eigene Komponente für drei Zeilen Markup (2026-08-04): den Text
 * eines Beitrags schreibt man an ZWEI Stellen — im `PostComposer` (neu) und in
 * `PostCard` (bearbeiten). Solange beide ihr eigenes Feld aufmachten, standen
 * dort zwei Schreibflächen für dasselbe Format, und sie sind auch schon
 * auseinandergelaufen (die Bearbeiten-Fläche hatte keinen Platzhalter).
 *
 * Der eigentliche Grund ist der nächste Schritt: die Umstellung auf `UEditor`
 * (Davids Editor-Vorgabe vom 2026-08-04) ist ein EIGENES Paket — sie ändert
 * das Body-Format und braucht ihren eigenen Beweis. Wenn sie kommt, ist sie
 * eine Änderung an DIESER Datei statt an zwei; eine vergessene zweite Stelle
 * hiesse „neu geschrieben sieht anders aus als bearbeitet".
 *
 * Heute ist es bewusst weiterhin `UTextarea` in beiden Fällen.
 */
withDefaults(defineProps<{ placeholder?: string }>(), { placeholder: '' })

const model = defineModel<string>({ required: true })
</script>

<template>
  <UTextarea
    v-model="model"
    :placeholder="placeholder"
    :rows="3"
    autoresize
    class="w-full"
  />
</template>
