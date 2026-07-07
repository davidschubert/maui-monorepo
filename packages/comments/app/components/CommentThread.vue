<script setup lang="ts">
// Rekursive Komponente — unbegrenzte Threading-Tiefe (Spec).
// Ruft sich für Antworten selbst auf; Nuxt löst den eigenen Namen auf.
import type { CommentNode } from '../../shared/types/comment'

// `nested` = verschachtelte Antworten → engerer Abstand als die Top-Level-Liste
defineProps<{ nodes: CommentNode[], nested?: boolean }>()

// Auf-/Zuklapp-Zustand kommt geteilt + persistiert aus CommentSection
const { isCollapsed, toggle } = useThreadCollapse()
</script>

<template>
  <!-- Sanftes Einblenden neuer Kommentare (eigener Post, Realtime, Antworten) —
       der User sieht, WO etwas dazugekommen ist, statt eines harten Sprungs -->
  <TransitionGroup name="comment" tag="ul" :class="nested ? 'space-y-2' : 'space-y-3'">
    <li v-for="node in nodes" :key="node.comment.$id">
      <CommentItem
        :comment="node.comment"
        :child-count="node.children.length"
        :collapsed="isCollapsed(node.comment.$id)"
        @toggle-collapse="toggle(node.comment.$id)"
      />
      <div
        v-if="node.children.length && !isCollapsed(node.comment.$id)"
        class="mt-2 ml-3 border-l border-default pl-4 transition-colors hover:border-accented"
        data-thread-children
      >
        <CommentThread :nodes="node.children" nested />
      </div>
    </li>
  </TransitionGroup>
</template>

<style scoped>
.comment-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.comment-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.comment-leave-active {
  transition: opacity 0.2s ease;
}
.comment-leave-to {
  opacity: 0;
}
.comment-move {
  transition: transform 0.3s ease;
}
</style>
