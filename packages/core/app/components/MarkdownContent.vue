<script setup lang="ts">
import { h, resolveComponent, type VNodeChild } from 'vue'
import { parseMarkdown, type BlockNode, type InlineNode } from '../../shared/markdown'
import { classifyContentLink } from '../../shared/contentLinks'
import { splitMentions } from '../../shared/mentions'

/**
 * Rendert user-generiertes Markdown (Subset-AST aus shared/markdown.ts)
 * ausschließlich über vnodes — kein v-html, Raw-HTML im Content bleibt
 * escapter Text (Vue). Links sind im Parser auf https?://-/-Pfade geprüft.
 * Core-Component (seit Phase 25) — Konsumenten: comments, posts, pages,
 * tickets, courses, events, platform-Tenant-Homepage.
 *
 * Link-Policy (Audit-Befund S3): EIGENE Pfade sind keine Fremdlinks —
 * sie werden über localePath() lokalisiert (auf /de/* führte [Feed](/feed)
 * sonst in die EN-Route), gehen als NuxtLink per Client-Navigation und
 * tragen KEIN nofollow/noreferrer. Pfade MIT Locale-Prefix bleiben, wie sie
 * der Autor geschrieben hat. Fremde Ziele behalten target=_blank +
 * noopener/noreferrer/nofollow — die Sicherheits-Schranke (isSafeHref im
 * Parser) ist unverändert.
 */
/**
 * ERWÄHNUNGEN (@handle, seit 2026-08-04) — `mentions` ist die Menge der
 * Handles, die es in DIESER Community wirklich gibt (Vergleichsform, klein).
 *
 * KEIN LINK, sondern nur eine Hervorhebung: öffentliche Profilseiten gibt es
 * nicht, ein Link liefe also ins Leere. Sobald es sie gibt, wird aus dem
 * `<span>` hier ein `NuxtLink` — die Stelle ist genau eine.
 *
 * WEGGELASSEN heisst KEINE Hervorhebung, nicht „alles hervorheben". Damit
 * ändert sich für die sieben bestehenden Aufrufer dieser Komponente nichts,
 * und ein Tippfehler-`@nmae` sieht nie so aus, als führte er zu einem
 * Menschen. Die Sicherheitsgrenze bleibt unangetastet: auch ein
 * Erwähnungs-Stück ist ein vnode-TEXTknoten, es gibt weiterhin keinen
 * v-html-Pfad.
 */
const props = defineProps<{ source: string, mentions?: string[] }>()

const knownMentions = computed(() => (props.mentions?.length ? new Set(props.mentions) : undefined))

const { locales } = useI18n()
const localePath = useLocalePath()
const NuxtLinkComponent = resolveComponent('NuxtLink')

const localeCodes = computed(() => locales.value.map(entry => entry.code))

function renderLink(node: Extract<InlineNode, { type: 'link' }>): VNodeChild {
  const linkClass = 'text-primary underline underline-offset-2'
  const kind = classifyContentLink(node.href, localeCodes.value)

  if (kind === 'external') {
    return h('a', {
      href: node.href,
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
      class: linkClass,
    }, renderInline(node.children))
  }

  // Nur präfixlose eigene Pfade lokalisieren. localePath() gibt für nicht
  // auflösbare Pfade '' zurück (Tippfehler im Inhalt) — dann bleibt der Href
  // wie geschrieben, statt auf die aktuelle Seite zu zeigen.
  const localized = kind === 'internal' ? localePath(node.href) || node.href : node.href

  return h(NuxtLinkComponent, { to: localized, class: linkClass }, () => renderInline(node.children))
}

function renderInline(nodes: InlineNode[]): VNodeChild[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'strong': return h('strong', renderInline(node.children))
      case 'em': return h('em', renderInline(node.children))
      case 'code': return h('code', { class: 'rounded bg-elevated px-1 py-0.5 text-[0.85em]' }, node.text)
      case 'link': return renderLink(node)
      default: return renderText(node.text)
    }
  })
}

/** Ein Text-Blatt: gewöhnlicher Text, mit hervorgehobenen Erwähnungen darin. */
function renderText(text: string): VNodeChild {
  const segments = splitMentions(text, knownMentions.value)
  if (segments.length === 1) return text
  return segments.map(segment => segment.type === 'mention'
    ? h('span', { class: 'font-medium text-primary', 'data-mention': segment.handle }, segment.text)
    : segment.text)
}

function renderBlock(block: BlockNode): VNodeChild {
  switch (block.type) {
    case 'codeblock':
      return h('pre', { class: 'overflow-x-auto rounded-md bg-elevated p-2 text-xs' }, h('code', block.text))
    case 'list':
      return h(block.ordered ? 'ol' : 'ul', { class: block.ordered ? 'list-decimal ps-5' : 'list-disc ps-5' },
        block.items.map(item => h('li', renderInline(item))))
    case 'quote':
      return h('blockquote', { class: 'border-s-2 border-default ps-3 text-muted whitespace-pre-line' }, renderInline(block.children))
    case 'heading':
      return h(block.level === 2 ? 'h2' : 'h3', {
        class: block.level === 2 ? 'text-lg font-semibold mt-4 mb-1' : 'text-base font-semibold mt-3 mb-1',
      }, renderInline(block.children))
    default:
      return h('p', { class: 'whitespace-pre-line' }, renderInline(block.children))
  }
}

const Content = () => h('div', { class: 'space-y-2 leading-relaxed' }, parseMarkdown(props.source).map(renderBlock))
</script>

<template>
  <Content />
</template>
