<script setup lang="ts">
// Rekursive Komponente — unbegrenzte Threading-Tiefe (Spec).
// Ruft sich für Antworten selbst auf; Nuxt löst den eigenen Namen auf.
import type { CommentNode } from '../../shared/types/comment'

defineProps<{ nodes: CommentNode[] }>()
</script>

<template>
  <ul class="space-y-3">
    <li v-for="node in nodes" :key="node.comment.$id">
      <CommentItem :comment="node.comment" />
      <div
        v-if="node.children.length"
        class="mt-3 ml-4 border-l-2 border-default pl-4"
        data-thread-children
      >
        <CommentThread :nodes="node.children" />
      </div>
    </li>
  </ul>
</template>
