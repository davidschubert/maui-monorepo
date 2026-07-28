<script setup lang="ts">
/**
 * Der EINE Leerzustand (Audit-Befund C11).
 *
 * Vorher war ein leerer Zustand fast überall eine graue Textzeile (`<p
 * class="text-sm text-muted">`) — ein neuer Kunde sah auf JEDER Seite genau
 * das. Hier gibt es stattdessen Icon + einen Satz + DEN einen nächsten Schritt.
 *
 * ZWEI Zustände, bewusst unterschieden — die Seite entscheidet, welchen sie
 * zeigt:
 *  - „noch nichts angelegt"  → CTA legt an     (icon der Sache, eigener Text)
 *  - „Filter ohne Treffer"   → CTA setzt zurück (ui.empty.noResults*, Core)
 *
 * Absichtlich KEIN Slot-Zoo: genau eine Aktion. Wer keine Aktion übergibt,
 * bekommt Icon + Text.
 */
defineProps<{
  /** Icon der Sache (z. B. i-ph-graduation-cap) */
  icon?: string
  /** Kurze Überschrift */
  title: string
  /** EIN Satz Erklärung */
  description?: string
  /** Beschriftung des einen nächsten Schritts — ohne sie gibt es keinen Knopf */
  actionLabel?: string
  actionIcon?: string
  /** Ziel-Route statt Klick-Handler (Aktion = Navigation) */
  actionTo?: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <UEmpty
    :icon="icon ?? 'i-ph-tray'"
    :title="title"
    :description="description"
    data-empty-state
  >
    <template v-if="actionLabel" #actions>
      <UButton
        v-if="actionTo"
        :to="actionTo"
        :icon="actionIcon"
        :label="actionLabel"
        data-empty-state-action
      />
      <UButton
        v-else
        :icon="actionIcon"
        :label="actionLabel"
        data-empty-state-action
        @click="emit('action')"
      />
    </template>
  </UEmpty>
</template>
