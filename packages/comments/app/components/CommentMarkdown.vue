<script setup lang="ts">
import { h, type VNodeChild } from 'vue'
import { parseMarkdown, type BlockNode, type InlineNode } from '../../shared/markdown'

const props = defineProps<{ source: string }>()

// Rendering ausschließlich über vnodes — kein v-html, Raw-HTML im Content
// bleibt escapter Text (Vue). Der Parser lässt nur den Subset-AST durch
// (shared/markdown.ts), Links sind dort bereits auf https?://-/-Pfade geprüft.
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
    default:
      return h('p', { class: 'whitespace-pre-line' }, renderInline(block.children))
  }
}

const Content = () => h('div', { class: 'space-y-2 leading-relaxed' }, parseMarkdown(props.source).map(renderBlock))
</script>

<template>
  <Content />
</template>
