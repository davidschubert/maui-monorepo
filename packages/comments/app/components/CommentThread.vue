<script setup lang="ts">
// Rekursive Komponente — unbegrenzte Threading-Tiefe (Spec).
// Ruft sich für Antworten selbst auf; Nuxt löst den eigenen Namen auf.
import type { CommentNode } from '../../shared/types/comment'

// `nested` = verschachtelte Antworten → engerer Abstand als die Top-Level-Liste
defineProps<{ nodes: CommentNode[], nested?: boolean }>()

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
  <ul :class="nested ? 'space-y-4' : 'space-y-6'">
    <li v-for="node in nodes" :key="node.comment.$id">
      <CommentItem
        :comment="node.comment"
        :child-count="node.children.length"
        :collapsed="collapsed.has(node.comment.$id)"
        @toggle-collapse="toggle(node.comment.$id)"
      />
      <div
        v-if="node.children.length && !collapsed.has(node.comment.$id)"
        class="mt-3 ml-3 border-l border-default pl-5 transition-colors hover:border-accented"
        data-thread-children
      >
        <CommentThread :nodes="node.children" nested />
      </div>
    </li>
  </ul>
</template>
