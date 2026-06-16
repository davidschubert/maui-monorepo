<script setup lang="ts">
// Account-Menü unten links in der Sidebar (Vorbild: UserMenu des Nuxt-UI-Templates),
// angepasst an unser Theme-System (Maui-Themes + Varianten), Appearance, Sprache, Logout.
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const colorMode = useColorMode()
const auth = useAuthStore()
const toast = useToast()
const { themes, theme, variant, setTheme, setVariant } = useTheme()

const displayName = computed(() => auth.user?.name || t('ui.account'))
const avatar = computed(() => {
  const src = typeof auth.user?.prefs?.avatarUrl === 'string' ? auth.user.prefs.avatarUrl : undefined
  return { src, alt: displayName.value }
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  auth.setUser(null)
  toast.add({ title: t('auth.logoutSuccess'), color: 'success', icon: 'i-ph-sign-out' })
  await navigateTo(localePath('/login'))
}

const items = computed<DropdownMenuItem[][]>(() => {
  const themeChildren: DropdownMenuItem[] = themes.map(entry => ({
    label: entry.name,
    slot: 'chip',
    chip: entry.color,
    type: 'checkbox',
    checked: theme.value.id === entry.id,
    onSelect: (event: Event) => { event.preventDefault(); setTheme(entry.id) },
  }))

  const variantChildren: DropdownMenuItem[] = [
    { label: t('themes.variantDefault'), slot: 'chip', chip: theme.value.color, type: 'checkbox', checked: variant.value === null, onSelect: (event: Event) => { event.preventDefault(); setVariant(null) } },
    ...theme.value.variants.map(entry => ({
      label: entry.id,
      slot: 'chip' as const,
      chip: entry.color,
      type: 'checkbox' as const,
      checked: variant.value === entry.id,
      onSelect: (event: Event) => { event.preventDefault(); setVariant(entry.id) },
    })),
  ]

  const appearanceChildren: DropdownMenuItem[] = ([
    ['light', 'i-ph-sun'],
    ['dark', 'i-ph-moon'],
    ['system', 'i-ph-monitor'],
  ] as const).map(([mode, icon]) => ({
    label: t(`dashboard.appearance.${mode}`),
    icon,
    type: 'checkbox',
    checked: colorMode.preference === mode,
    onSelect: (event: Event) => { event.preventDefault(); colorMode.preference = mode },
  }))

  const languageChildren: DropdownMenuItem[] = ([
    ['de', 'Deutsch'],
    ['en', 'English'],
  ] as const).map(([code, label]) => ({
    label,
    type: 'checkbox',
    checked: locale.value === code,
    onSelect: (event: Event) => { event.preventDefault(); setLocale(code) },
  }))

  return [
    [{ type: 'label', label: displayName.value, avatar: avatar.value }],
    [
      { label: t('themes.label'), icon: 'i-ph-palette', children: themeChildren },
      ...(theme.value.variants.length ? [{ label: t('themes.variantLabel'), icon: 'i-ph-swatches', children: variantChildren }] : []),
      { label: t('themes.modeLabel'), icon: 'i-ph-sun-horizon', children: appearanceChildren },
      { label: t('ui.language'), icon: 'i-ph-translate', children: languageChildren },
    ],
    [{ label: t('auth.logout'), icon: 'i-ph-sign-out', onSelect: () => { void logout() } }],
  ]
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :avatar="avatar"
      :label="collapsed ? undefined : displayName"
      :trailing-icon="collapsed ? undefined : 'i-ph-caret-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />

    <template #chip-leading="{ item }">
      <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: (item as { chip?: string }).chip }" />
    </template>
  </UDropdownMenu>
</template>
