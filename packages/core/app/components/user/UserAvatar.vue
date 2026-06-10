<script setup lang="ts">
/** Minimale User-Shape — CurrentUser ist zuweisbar, aber auch z.B. { name } aus Kommentar-Rows */
export interface AvatarUser {
  name?: string | null
  email?: string | null
  prefs?: { avatarUrl?: string } | null
}

const props = defineProps<{
  /** Default: eingeloggter User aus dem Store */
  user?: AvatarUser | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
}>()

const { user: currentUser } = useCurrentUser()
const resolved = computed(() => props.user ?? currentUser.value)

// avatarUrl aus den Account-prefs (keine profiles Table!), sonst Initialen-Fallback
const src = computed(() => {
  const url = resolved.value?.prefs?.avatarUrl
  return typeof url === 'string' && url.length > 0 ? url : undefined
})

const alt = computed(() => resolved.value?.name || resolved.value?.email || 'User')
</script>

<template>
  <UAvatar :src="src" :alt="alt" :size="size ?? 'md'" />
</template>
