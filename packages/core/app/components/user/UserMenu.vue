<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  auth.setUser(null)
  toast.add({ title: t('auth.logoutSuccess'), color: 'success', icon: 'i-ph-sign-out' })
  await navigateTo('/login')
}

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: auth.user?.name || 'Account',
    avatar: { alt: auth.user?.name || 'User' },
    type: 'label',
  },
  { type: 'separator' },
  // Nur für Admins — die Route liefert der admin-Layer; Apps ohne ihn
  // haben üblicherweise keine admin-gelabelten User
  ...(isAdminUser(auth.user)
    ? [{ label: t('ui.adminArea'), icon: 'i-ph-gauge', to: '/admin' } satisfies DropdownMenuItem]
    : []),
  {
    label: t('auth.logout'),
    icon: 'i-ph-sign-out',
    onSelect: () => { void logout() },
  },
])
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton color="neutral" variant="ghost" class="rounded-full p-1" aria-label="Benutzermenü">
      <UserAvatar size="sm" />
    </UButton>
  </UDropdownMenu>
</template>
