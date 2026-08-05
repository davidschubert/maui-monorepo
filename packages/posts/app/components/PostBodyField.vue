<script setup lang="ts">
/**
 * DIE Schreibfläche für einen Beitragstext — einmal, für alle Stellen.
 *
 * Warum eine eigene Komponente (2026-08-04): den Text eines Beitrags schreibt
 * man an ZWEI Stellen — im `PostComposer` (neu) und in `PostCard`
 * (bearbeiten). Solange beide ihr eigenes Feld aufmachten, standen dort zwei
 * Schreibflächen für dasselbe Format, und sie sind auch schon auseinander-
 * gelaufen (die Bearbeiten-Fläche hatte keinen Platzhalter).
 *
 * Seit dem 2026-08-04 ist die Fläche `UEditor` im Markdown-Modus (Davids
 * Editor-Vorgabe). Die Konfiguration — und die Begründung, warum der Editor
 * nur kann, was der Renderer kennt — steht in `PostBodyEditor.vue`.
 *
 * ── WARUM ZWEI DATEIEN: NACHLADEN ──────────────────────────────────────────
 * Tiptap ist schwer. Der Feed montiert diese Fläche EIFRIG (PostFeed:
 * `v-if="isLoggedIn"`), also läge der Editor sonst im Bündel jeder
 * eingeloggten Feed-Ansicht — auch bei den vielen Aufrufen, in denen niemand
 * etwas schreibt. Deshalb steht hier bis zum ersten Fokus eine `UTextarea`,
 * und `LazyPostBodyEditor` kommt erst dann (Muster K4:
 * `LazyThemePickerModal` in themes/DisplaySettingsMenu).
 *
 * DIE TEXTFLÄCHE IST KEINE ATTRAPPE, sondern dasselbe Feld wie vor der
 * Umstellung: sie hängt am selben `v-model`. Wer hineintippt, bevor der
 * Editor da ist, verliert nichts — der Editor übernimmt den Stand und setzt
 * den Cursor ans Ende. Und schlägt das Nachladen fehl, bleibt eine
 * funktionierende Schreibfläche stehen statt eines leeren Kastens.
 *
 * Umgeschaltet wird beim FOKUS, nicht beim Tippen: da ist die Absicht
 * eindeutig, und der Wechsel passiert vor dem ersten Zeichen statt mitten im
 * Wort. `immediate` überspringt den Zwischenschritt dort, wo die Absicht schon
 * feststeht (Bearbeiten: der Knopf wurde gerade geklickt).
 */
const props = withDefaults(defineProps<{
  placeholder?: string
  /** Direkt mit dem Editor starten (Bearbeiten-Fall — die Absicht steht fest). */
  immediate?: boolean
}>(), { placeholder: '', immediate: false })

const model = defineModel<string>({ required: true })

const editorActive = ref(props.immediate)
</script>

<template>
  <!-- EIN Wurzelelement, damit durchgereichte Attribute (data-composer-body …)
       an derselben Stelle landen wie vorher.

       Der Auslöser hängt HIER und nicht an der Textfläche: `UTextarea` gibt
       kein Fokus-Ereignis nach außen (nachgesehen in @nuxt/ui 4.10), ein
       `@focus` daran liefe also ins Leere. `focus` steigt zudem nicht auf,
       `focusin` tut es. -->
  <div class="w-full" @focusin="editorActive = true">
    <LazyPostBodyEditor
      v-if="editorActive"
      v-model="model"
      :placeholder="props.placeholder"
      autofocus
    />
    <UTextarea
      v-else
      v-model="model"
      :placeholder="props.placeholder"
      :rows="3"
      autoresize
      class="w-full"
      :ui="{ base: 'min-h-24' }"
    />
  </div>
</template>
