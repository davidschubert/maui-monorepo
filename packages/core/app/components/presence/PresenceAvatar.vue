<script setup lang="ts">
/**
 * Avatar mit optionalem Icon-Badge in der Ecke — auf Nuxt-UI UChip statt
 * handgebautem Overlay (geparkter Kosmetik-Punkt, 2026-07-11): Position/
 * Ring/Farben kommen aus dem UChip-Theme und folgen Theme-Wechseln
 * automatisch. Funktioniert innerhalb einer UAvatarGroup (die Gruppe
 * injiziert size/color in das innere UAvatar — Nesting ist transparent).
 * Hat der User ein Profilbild, gewinnt das Bild; sonst Initialen.
 */
type BadgeColor = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

const props = defineProps<{
  name: string
  avatarUrl?: string
  /** Icon-Badge, z.B. 'i-ph-pencil-simple' (tippt) oder 'i-ph-arrow-bend-up-left' (antwortet) */
  icon?: string
  iconColor?: BadgeColor
}>()

// Initialen aus avatarInitials (core app/utils/avatar.ts) statt aus dem
// eingebauten UAvatar-Fallback — der nahm das erste Zeichen jedes Wortes
// („Lena (Coach)" → „L(", Audit-Befund S2)
const initials = computed(() => avatarInitials(props.name))
</script>

<template>
  <UChip v-if="icon" :color="iconColor ?? 'primary'" size="3xl" position="bottom-right" inset>
    <UAvatar :src="avatarUrl || undefined" :alt="name" :text="initials" />
    <template #content>
      <UIcon :name="icon" class="size-2" />
    </template>
  </UChip>
  <UAvatar v-else :src="avatarUrl || undefined" :alt="name" :text="initials" />
</template>
