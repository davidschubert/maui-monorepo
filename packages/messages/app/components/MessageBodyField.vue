<script setup lang="ts">
/**
 * DIE Schreibfläche für eine private Nachricht — einmal, für beide Stellen
 * (Antwort im Verlauf und erste Nachricht im „Neue Nachricht"-Dialog).
 *
 * Dasselbe Muster wie `PostBodyField` im posts-Layer, und bewusst als eigene
 * Datei statt eines Imports: ein Produkt-Layer importiert keinen anderen
 * (A14). Geteilt wird der Mechanismus (`UEditor`, das Markdown-Subset aus
 * core), nicht die Komponente.
 *
 * ── NACHGELADEN, UND DIE TEXTFLÄCHE IST KEINE ATTRAPPE ──────────────────
 * Bis zum ersten Fokus steht hier eine `UTextarea` am SELBEN `v-model`. Wer
 * hineintippt, bevor der Editor da ist, verliert nichts — und schlägt das
 * Nachladen fehl, bleibt eine funktionierende Schreibfläche stehen statt
 * eines leeren Kastens.
 *
 * Umgeschaltet wird beim FOKUS, nicht beim Tippen: da ist die Absicht
 * eindeutig, und der Wechsel passiert vor dem ersten Zeichen statt mitten im
 * Wort. Der Haken sitzt am WRAPPER, weil `UTextarea` kein Fokus-Ereignis nach
 * außen gibt (`@focus` daran liefe ins Leere) und `focus` nicht aufsteigt,
 * `focusin` aber schon.
 */
const props = withDefaults(defineProps<{
  placeholder?: string
  /** Direkt mit dem Editor starten (der Dialog — die Absicht steht fest). */
  immediate?: boolean
  rows?: number
}>(), { placeholder: '', immediate: false, rows: 3 })

const emit = defineEmits<{ typing: [] }>()

const model = defineModel<string>({ required: true })

const editorActive = ref(props.immediate)
</script>

<template>
  <div class="w-full" @focusin="editorActive = true">
    <LazyMessageBodyEditor
      v-if="editorActive"
      v-model="model"
      :placeholder="props.placeholder"
      autofocus
      @typing="emit('typing')"
    />
    <UTextarea
      v-else
      v-model="model"
      :placeholder="props.placeholder"
      :rows="props.rows"
      autoresize
      class="w-full"
      :ui="{ base: 'min-h-20' }"
      @update:model-value="emit('typing')"
    />
  </div>
</template>
