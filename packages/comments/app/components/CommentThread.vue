<script setup lang="ts">
// Rekursive Komponente — unbegrenzte Threading-Tiefe (Spec).
// Ruft sich für Antworten selbst auf; Nuxt löst den eigenen Namen auf.
import type { CommentNode } from '../../shared/types/comment'

defineProps<{ nodes: CommentNode[] }>()

// Eingeklappte Sub-Threads (Antworten ausgeblendet) — pro Ebene gehalten
const collapsed = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}
</script>

<template>
  <ul class="space-y-4">
    <li v-for="node in nodes" :key="node.comment.$id">
      <CommentItem
        :comment="node.comment"
        :child-count="node.children.length"
        :collapsed="collapsed.has(node.comment.$id)"
        @toggle-collapse="toggle(node.comment.$id)"
      />
      <div
        v-if="node.children.length && !collapsed.has(node.comment.$id)"
        class="mt-3 ml-3 border-l border-default pl-4"
        data-thread-children
      >
        <CommentThread :nodes="node.children" />
      </div>
    </li>
  </ul>
</template>
