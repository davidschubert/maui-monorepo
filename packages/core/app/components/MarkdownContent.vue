<script setup lang="ts">
import { h, type VNodeChild } from 'vue'
import { parseMarkdown, type BlockNode, type InlineNode } from '../../shared/markdown'

/**
 * Rendert user-generiertes Markdown (Subset-AST aus shared/markdown.ts)
 * ausschließlich über vnodes — kein v-html, Raw-HTML im Content bleibt
 * escapter Text (Vue). Links sind im Parser auf https?://-/-Pfade geprüft.
 * Core-Component (seit Phase 25) — Konsumenten: comments, posts.
 */
const props = defineProps<{ source: string }>()

function renderInline(nodes: InlineNode[]): VNodeChild[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'strong': return h('strong', renderInline(node.children))
      case 'em': return h('em', renderInline(node.children))
      case 'code': return h('code', { class: 'rounded bg-elevated px-1 py-0.5 text-[0.85em]' }, node.text)
      case 'link': return h('a', {
        href: node.href,
        target: node.href.startsWith('/') ? undefined : '_blank',
        rel: 'noopener noreferrer nofollow',
        class: 'text-primary underline underline-offset-2',
      }, renderInline(node.children))
      default: return node.text
    }
  })
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
