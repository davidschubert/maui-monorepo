<script setup lang="ts">
/**
 * Kleiner Indikator „N andere sehen diese Seite" — sitzt global in der Dashboard-
 * Shell, broadcastet über useViewingPresence() die aktuelle Seite und zeigt die
 * Avatare der anderen Betrachter (mit Tooltip). Verschwindet, wenn man allein ist.
 */
const { t } = useI18n()
const { others } = useViewingPresence()
</script>

<template>
  <div
    v-if="others.length"
    class="flex items-center gap-1.5 rounded-full bg-elevated/80 px-2 py-1 shadow-sm ring ring-default backdrop-blur"
    :title="t('admin.presence.viewingPage', { count: others.length })"
  >
    <UAvatarGroup size="2xs" :max="4">
      <UTooltip v-for="u in others" :key="u.userId" :text="u.userName">
        <UAvatar :src="u.avatarUrl || undefined" :alt="u.userName" />
      </UTooltip>
    </UAvatarGroup>
    <span class="pe-0.5 text-xs text-muted">{{ others.length }}</span>
  </div>
</template>
