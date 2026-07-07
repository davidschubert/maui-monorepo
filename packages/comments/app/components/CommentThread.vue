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
  <!-- Neue Kommentare KLAPPEN AUF (Höhe 0 → Zielhöhe, core expandTransition):
       die Nachbarn gleiten mit statt zu springen — kein CSS-move nötig -->
  <TransitionGroup :css="false" tag="ul" :class="nested ? 'space-y-2' : 'space-y-3'" @enter="expandEnter" @leave="expandLeave">
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
