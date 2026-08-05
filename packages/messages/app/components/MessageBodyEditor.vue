<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'

/**
 * DIE Schreibfläche einer privaten Nachricht — `UEditor` im Markdown-Modus
 * (Davids Editor-Vorgabe: die UEditor-Bausteine sind gesetzt, nichts selbst
 * bauen).
 *
 * NICHT DIREKT BENUTZEN: die Fläche ist `MessageBodyField`. Diese Datei
 * existiert getrennt, damit sie NACHGELADEN werden kann — Tiptap wiegt
 * mehrere hundert Kilobyte, und der Posteingang montiert die Fläche eifrig.
 * Erst wer wirklich schreibt, holt diesen Teil (Muster `PostBodyField` /
 * `LazyThemePickerModal`).
 *
 * ── DER WERKZEUG-VORRAT IST AN core/shared/markdown.ts GEKOPPELT ─────────
 * Dieselbe harte Kopplung wie beim Beitrags-Editor, und aus demselben Grund:
 * eine Nachricht wird mit `MarkdownContent` gerendert, und was der Parser
 * nicht kennt, stünde als ROHER TEXT in der Nachricht. Abgeschaltet ist
 * deshalb, was der Renderer nicht kann — und zwar im SCHEMA, nicht bloß in
 * der Werkzeugleiste: ein Tastenkürzel oder ein Einfügen aus der
 * Zwischenablage geht an einer fehlenden Schaltfläche vorbei.
 *
 * ── ZWEI DINGE WENIGER ALS BEIM BEITRAG, MIT GRUND ──────────────────────
 * Überschriften und Code-Blöcke fehlen hier. Eine private Nachricht ist ein
 * Satz an einen Menschen, kein Dokument — eine h2 mitten in einer
 * Sprechblase sieht aus wie ein Fehler. Der Parser könnte beides; das ist
 * eine Produkt-Entscheidung, keine technische. Wer sie zurücknimmt, fügt
 * ZWEI Dinge hinzu: den Knopf UND den Namen in `RULE_EXTENSIONS`.
 *
 * ── `gfm: false` BEIM LESEN ──────────────────────────────────────────────
 * Mit Nuxt UIs Vorgabe `gfm: true` parst `marked` `~~alt~~` als
 * Durchstreichung — die Marke gibt es hier nicht, sie fiele weg, und aus
 * `~~alt~~` würde beim Speichern `alt`. Eine bestehende Nachricht verlöre
 * also Zeichen, bloß weil jemand sie aufschlägt.
 *
 * ── ERWÄHNUNGEN SIND AUS ────────────────────────────────────────────────
 * `UEditorMentionMenu` serialisiert zu `[@ id="…" label="…"]` und stünde roh
 * in der Nachricht. In einem 1:1-Gespräch ist eine Erwähnung ohnehin
 * gegenstandslos: es gibt genau ein Gegenüber.
 */
const props = withDefaults(defineProps<{
  placeholder?: string
  autofocus?: boolean
}>(), { placeholder: '', autofocus: false })

const model = defineModel<string>({ required: true })

const emit = defineEmits<{ typing: [] }>()

const { t } = useI18n()

const toolbarItems = computed<EditorToolbarItem[]>(() => ([
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b', 'aria-label': t('messages.editor.bold'), tooltip: { text: t('messages.editor.bold') } },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic', 'aria-label': t('messages.editor.italic'), tooltip: { text: t('messages.editor.italic') } },
  { kind: 'mark', mark: 'code', icon: 'i-ph-code-simple', 'aria-label': t('messages.editor.code'), tooltip: { text: t('messages.editor.code') } },
  { kind: 'bulletList', icon: 'i-ph-list-bullets', 'aria-label': t('messages.editor.bulletList'), tooltip: { text: t('messages.editor.bulletList') } },
  { kind: 'orderedList', icon: 'i-ph-list-numbers', 'aria-label': t('messages.editor.orderedList'), tooltip: { text: t('messages.editor.orderedList') } },
  { kind: 'link', icon: 'i-ph-link', 'aria-label': t('messages.editor.link'), tooltip: { text: t('messages.editor.link') } },
  { kind: 'blockquote', icon: 'i-ph-quotes', 'aria-label': t('messages.editor.quote'), tooltip: { text: t('messages.editor.quote') } },
]))

/** Was der Renderer nicht kann, kommt gar nicht erst ins Schema (siehe Kopf). */
const starterKit = {
  strike: false as const,
  underline: false as const,
  heading: false as const,
  codeBlock: false as const,
}

/** Siehe Kopf — GFM würde bestehende Zeichen verschlucken. */
const markdown = { markedOptions: { gfm: false } } as const

/**
 * ERLAUBNISLISTE, fail-closed: `enableInputRules`/`enablePasteRules` nehmen
 * statt `true` eine LISTE. Was nicht dasteht, hat keine Eingabe-Automatik —
 * bringt eine künftige @nuxt/ui-Version eine neue Erweiterung mit, ist sie
 * damit still AUS statt still AN. `horizontalRule` fehlt bewusst: `---` bleibt
 * getippter Text.
 */
const RULE_EXTENSIONS = ['bold', 'italic', 'code', 'bulletList', 'orderedList', 'blockquote', 'link']

/**
 * Der zweite Weg zu einer Trennlinie: `UEditor` hängt `HorizontalRule`
 * UNBEDINGT an (`starterKit: false` wäre Nur-Text). Eingabe-Regel ist oben zu,
 * hier fällt die eingefügte `<hr>` weg — eine Zeichenketten-Ersetzung, bevor
 * ProseMirror das HTML liest, kostet keine eigene Tiptap-Abhängigkeit.
 */
const editorProps = {
  transformPastedHTML: (html: string) => html.replace(/<hr\b[^>]*>/gi, ''),
}
</script>

<template>
  <UEditor
    v-model="model"
    content-type="markdown"
    :starter-kit="starterKit"
    :markdown="markdown"
    :image="false"
    :mention="false"
    :placeholder="props.placeholder"
    :enable-input-rules="RULE_EXTENSIONS"
    :enable-paste-rules="RULE_EXTENSIONS"
    :editor-props="editorProps"
    :autofocus="props.autofocus ? 'end' : false"
    class="w-full rounded-md border border-default"
    :ui="{ base: 'px-3 py-2', content: 'min-h-16' }"
    @update:model-value="emit('typing')"
  >
    <template #default="{ editor }">
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        class="border-b border-default px-1.5 py-1"
      />
    </template>
  </UEditor>
</template>
