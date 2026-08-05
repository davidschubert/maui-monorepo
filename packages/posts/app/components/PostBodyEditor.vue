<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { POST_EMOJI_ITEMS } from '../utils/emojiMenuItems'

/**
 * DER Beitrags-Editor — `UEditor` im Markdown-Modus (Davids Editor-Vorgabe vom
 * 2026-08-04, gebaut am selben Tag).
 *
 * NICHT DIREKT BENUTZEN: die Schreibfläche ist `PostBodyField`. Diese Datei
 * existiert getrennt, damit sie NACHGELADEN werden kann — Tiptap wiegt
 * mehrere hundert Kilobyte und darf nicht im Bündel jeder eingeloggten
 * Feed-Ansicht stehen (Muster K4: `LazyThemePickerModal`). Der Feed montiert
 * `PostBodyField` eifrig; erst wer wirklich schreibt, holt diesen Teil.
 *
 * ── DAS FORMAT ÄNDERT SICH NICHT ───────────────────────────────────────────
 * Gespeichert wird weiterhin das Markdown-SUBSET aus core/shared/markdown.ts,
 * Spalte `community_posts.body`. Keine Migration, keine zweite Darstellung:
 * was hier herauskommt, rendert `MarkdownContent` — derselbe Parser wie
 * bisher, dieselbe Sicherheitsgrenze (kein v-html).
 *
 * ── DER EDITOR DARF NUR, WAS DER PARSER KANN ───────────────────────────────
 * Das ist der ganze Punkt dieser Konfiguration, und es reicht NICHT, Knöpfe
 * wegzulassen: ein Tastenkürzel oder ein Einfügen aus der Zwischenablage geht
 * an einer fehlenden Schaltfläche vorbei. Deshalb wird abgeschaltet, was der
 * Renderer nicht kennt:
 *  - `strike`/`underline` ⇒ Marke gar nicht erst im Schema (Strg+Shift+X,
 *    Strg+U laufen ins Leere, `<s>`/`<u>` aus der Zwischenablage verlieren
 *    nur ihre Auszeichnung, der Text bleibt);
 *  - `heading: { levels: [2, 3] }` ⇒ h1 und h4+ existieren nicht; ein
 *    eingefügtes `<h1>` wird zum Absatz (der Parser kennt nur h2/h3, die
 *    Seiten-Überschrift ist die h1);
 *  - `:image="false"`, `:mention="false"` ⇒ beide Knoten fehlen im Schema;
 *  - Tabellen und Aufgabenlisten sind im `StarterKit` gar nicht enthalten.
 *
 * ZWEI REST-STELLEN, die die Bibliothek nicht hergibt, mit ihrer Behandlung:
 * 1. `HorizontalRule` hängt `UEditor` UNBEDINGT an (Editor.vue: `starterKit
 *    !== false && HorizontalRule.extend(...)`), und `starterKit: false` wäre
 *    Nur-Text — also alles andere weg. Die zwei Wege dorthin sind deshalb
 *    EINZELN zu: die Eingaberegel `---` steht nicht auf der Erlaubnisliste
 *    unten, und `<hr>` aus der Zwischenablage entfernt `transformPastedHTML`.
 *    Bleibt der Programm-Befehl, den keine Schaltfläche auslöst; käme doch
 *    eine Linie zustande, stünde im Beitrag sichtbar `---` — wie heute in der
 *    Textfläche auch, also unschön, aber nichts Unbekanntes.
 * 2. `gfm: false` beim Markdown-LESEN (Vorgabe von `UEditor` wäre `true`):
 *    mit GFM parst `marked` `~~alt~~` als Durchstreichung — die Marke gibt es
 *    hier nicht, sie fiele weg, und aus `~~alt~~` würde beim Speichern
 *    `alt`. Ein bestehender Beitrag verlöre also Zeichen, bloß weil ihn
 *    jemand aufschlägt. Ohne GFM bleibt es Text und kommt als `\~\~alt\~\~`
 *    zurück, was der Parser wieder zu `~~alt~~` macht. Dasselbe gilt für
 *    Tabellen-Zeilen (`| a | b |`).
 *
 * ── DIE ERLAUBNISLISTE IST FAIL-CLOSED ─────────────────────────────────────
 * `enableInputRules`/`enablePasteRules` nehmen statt `true` eine LISTE von
 * Erweiterungen (`isExtensionRulesEnabled` in @tiptap/core). Was nicht
 * dasteht, hat keine Eingabe-Automatik. Bringt eine künftige @nuxt/ui-Version
 * eine neue Erweiterung mit, ist sie damit still AUS statt still AN — die
 * richtige Richtung für einen Editor, der ein Subset bedienen soll.
 *
 * ── WAS BEWUSST FEHLT ──────────────────────────────────────────────────────
 * `UEditorMentionMenu`: gemessen erzeugt es `[@ id="u1" label="Anna"]` — eine
 * eigene Klammer-Syntax, die unser Parser roh durchreicht. Erwähnungen sind
 * ein eigenes Paket (Handle, Nutzer-Id, Benachrichtigungstext, Linkziel);
 * Details in docs/plans/COMPOSER-UEDITOR.md.
 */
const props = withDefaults(defineProps<{
  placeholder?: string
  /** Cursor beim Montieren ans Textende setzen (Bearbeiten-Fall). */
  autofocus?: boolean
}>(), { placeholder: '', autofocus: false })

const model = defineModel<string>({ required: true })

const { t } = useI18n()

/**
 * Genau das Subset, in derselben Reihenfolge wie im Seiten-Editor (pages) —
 * zwei Schreibflächen für dasselbe Format sollen gleich aussehen.
 * Jeder Knopf trägt `aria-label` UND Tooltip: er zeigt nur ein Symbol.
 */
const toolbarItems = computed<EditorToolbarItem[]>(() => ([
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b', 'aria-label': t('posts.editor.bold'), tooltip: { text: t('posts.editor.bold') } },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic', 'aria-label': t('posts.editor.italic'), tooltip: { text: t('posts.editor.italic') } },
  { kind: 'mark', mark: 'code', icon: 'i-ph-code-simple', 'aria-label': t('posts.editor.code'), tooltip: { text: t('posts.editor.code') } },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two', 'aria-label': t('posts.editor.heading2'), tooltip: { text: t('posts.editor.heading2') } },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three', 'aria-label': t('posts.editor.heading3'), tooltip: { text: t('posts.editor.heading3') } },
  { kind: 'bulletList', icon: 'i-ph-list-bullets', 'aria-label': t('posts.editor.bulletList'), tooltip: { text: t('posts.editor.bulletList') } },
  { kind: 'orderedList', icon: 'i-ph-list-numbers', 'aria-label': t('posts.editor.orderedList'), tooltip: { text: t('posts.editor.orderedList') } },
  { kind: 'link', icon: 'i-ph-link', 'aria-label': t('posts.editor.link'), tooltip: { text: t('posts.editor.link') } },
  { kind: 'blockquote', icon: 'i-ph-quotes', 'aria-label': t('posts.editor.quote'), tooltip: { text: t('posts.editor.quote') } },
  { kind: 'codeBlock', icon: 'i-ph-code', 'aria-label': t('posts.editor.codeBlock'), tooltip: { text: t('posts.editor.codeBlock') } },
]))

/** Siehe Kopf: was der Renderer nicht kann, kommt gar nicht erst ins Schema. */
const starterKit = { strike: false as const, underline: false as const, heading: { levels: [2, 3] as (2 | 3)[] } }

/** Siehe Kopf, Punkt 2 — GFM würde bestehende Zeichen verschlucken. */
const markdown = { markedOptions: { gfm: false } } as const

/**
 * Erlaubnisliste für Eingabe- und Einfüge-Automatik (siehe Kopf). `horizontalRule`
 * fehlt bewusst: `---` bleibt damit getippter Text statt einer Linie.
 */
const RULE_EXTENSIONS = [
  'bold', 'italic', 'code', 'codeBlock', 'heading',
  'bulletList', 'orderedList', 'blockquote', 'link',
]

/**
 * Der zweite Weg zu einer Trennlinie (siehe Kopf, Punkt 1). Bewusst eine
 * Zeichenketten-Ersetzung: `transformPastedHTML` bekommt das rohe HTML, BEVOR
 * ProseMirror es liest — das kostet keine eigene Tiptap-Abhängigkeit.
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
    :ui="{ base: 'px-3 py-2', content: 'min-h-20' }"
  >
    <template #default="{ editor }">
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        class="border-b border-default px-1.5 py-1"
      />
      <!-- Emoji sind reiner Text (`:` öffnet die Auswahl) — siehe utils/emojiMenuItems.ts -->
      <UEditorEmojiMenu :editor="editor" :items="POST_EMOJI_ITEMS" />
    </template>
  </UEditor>
</template>
