<script setup lang="ts">
/**
 * Die Zustände eines Themas als Abzeichen (F1 Stufe 3) — in der Themen-Liste
 * und über der Detailansicht.
 *
 * EIGENE KOMPONENTE, obwohl es drei `UBadge` sind: sonst stünde dieselbe
 * Zuordnung von Zustand zu Farbe und Zeichen an zwei Stellen, und die zweite
 * würde bei der nächsten Änderung vergessen.
 *
 * FARBWAHL mit Absicht: „Angeheftet" ist `primary` (Aufmerksamkeit, das ist
 * sein Zweck), „Gelöst" `success` (etwas ist gut ausgegangen), „Geschlossen"
 * `neutral` — bewusst NICHT `warning` oder `error`: ein geschlossenes Thema ist
 * kein Fehler und keine Strafe, sondern ein abgeschlossenes Gespräch.
 *
 * NUR TEXT + ZEICHEN, keine reinen Symbole: „gelöst" und „geschlossen" sehen
 * als Häkchen und Schloss ähnlich genug aus, dass man sie verwechselt.
 */
const props = defineProps<{
  pinned?: boolean
  closed?: boolean
  solved?: boolean
  size?: 'sm' | 'md'
}>()

const { t } = useI18n()
const size = computed(() => props.size ?? 'sm')
</script>

<template>
  <span v-if="pinned || closed || solved" class="inline-flex flex-wrap items-center gap-1 align-middle">
    <UBadge
      v-if="pinned"
      color="primary"
      variant="subtle"
      :size="size"
      icon="i-ph-push-pin"
      data-topic-badge-pinned
    >
      {{ t('posts.discussions.state.pinned') }}
    </UBadge>
    <UBadge
      v-if="solved"
      color="success"
      variant="subtle"
      :size="size"
      icon="i-ph-check-circle"
      data-topic-badge-solved
    >
      {{ t('posts.discussions.state.solved') }}
    </UBadge>
    <UBadge
      v-if="closed"
      color="neutral"
      variant="subtle"
      :size="size"
      icon="i-ph-lock-simple"
      data-topic-badge-closed
    >
      {{ t('posts.discussions.state.closed') }}
    </UBadge>
  </span>
</template>
