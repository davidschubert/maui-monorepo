<script setup lang="ts">
/**
 * Avatar mit optionalem Icon-Badge in der Ecke — die Icon-Variante des Chips.
 * Funktioniert innerhalb einer UAvatarGroup (die Gruppe injiziert size/color in
 * das innere UAvatar; das Badge sitzt als Overlay im relativen Wrapper). Hat der
 * User ein Profilbild, gewinnt das Bild; sonst Initialen in der Gruppenfarbe.
 */
type BadgeColor = 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

defineProps<{
  name: string
  avatarUrl?: string
  /** Icon-Badge, z.B. 'i-ph-pencil-simple' (tippt) oder 'i-ph-arrow-bend-up-left' (antwortet) */
  icon?: string
  iconColor?: BadgeColor
}>()

// Vollständige Klassennamen (kein `bg-${x}` — sonst sieht Tailwind sie nicht)
const badgeBg: Record<BadgeColor, string> = {
  primary: 'bg-primary text-inverted',
  success: 'bg-success text-inverted',
  info: 'bg-info text-inverted',
  warning: 'bg-warning text-inverted',
  error: 'bg-error text-inverted',
  neutral: 'bg-inverted text-inverted',
}
</script>

<template>
  <span class="relative inline-flex">
    <UAvatar :src="avatarUrl || undefined" :alt="name" />
    <span
      v-if="icon"
      class="absolute -bottom-0.5 -end-0.5 inline-flex items-center justify-center rounded-full p-0.5 ring-2 ring-bg"
      :class="badgeBg[iconColor ?? 'primary']"
    >
      <UIcon :name="icon" class="size-2.5" />
    </span>
  </span>
</template>
