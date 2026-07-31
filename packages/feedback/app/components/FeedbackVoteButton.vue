<script setup lang="ts">
import type { FeedbackEntry } from '../../../control/shared/customerFeedback'

/**
 * EINE Stimme pro Person (Davids Entscheidung 3) — der Knopf ist deshalb ein
 * Umschalter, kein Zähler zum Hochklicken.
 *
 * Die ZWEITE ZAHL darunter ist der eigentliche Kniff der Entscheidung: „aus N
 * Communities". Gegen die Schlagseite großer Communities hilft keine andere
 * Stimmenlogik, sondern eine zweite Angabe daneben — Breite und Lautstärke
 * stehen nebeneinander, und der Betrachter darf sie selbst gewichten. Sie
 * erscheint erst ab zwei, weil „aus 1 Community" nichts erzählt.
 */
const props = defineProps<{ entry: FeedbackEntry, busy?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-center gap-0.5">
    <UButton
      :color="props.entry.hasVoted ? 'primary' : 'neutral'"
      :variant="props.entry.hasVoted ? 'soft' : 'outline'"
      :loading="props.busy"
      :aria-pressed="props.entry.hasVoted"
      :aria-label="t('feedback.list.vote')"
      class="flex-col px-3 py-1.5"
      :data-feedback-vote="props.entry.id"
      @click="emit('toggle')"
    >
      <UIcon name="i-ph-caret-up" class="size-4" />
      <span class="text-sm font-medium tabular-nums">{{ props.entry.voteCount }}</span>
    </UButton>
    <span v-if="props.entry.communityCount > 1" class="text-center text-[10px] leading-tight text-dimmed">
      {{ t('feedback.list.fromCommunities', { count: props.entry.communityCount }) }}
    </span>
  </div>
</template>
