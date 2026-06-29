<script setup lang="ts">
// Account-Menü unten links in der Sidebar (Vorbild: UserMenu des Nuxt-UI-Templates),
// angepasst an unser Theme-System (Maui-Themes + Varianten), Appearance, Sprache, Logout.
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

// Eigene Felder für den getönten Swatch-Icon-Slot (Theme-/Variant-Farbe)
type SwatchItem = DropdownMenuItem & { swatchIcon?: string, swatchColor?: string }

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const colorMode = useColorMode()
const auth = useAuthStore()
const toast = useToast()
const { themes, theme, variant, setTheme, setVariant, neutrals, neutral, setNeutral } = useTheme()
const localeOptions = useLocaleOptions()

// Sidebar-Optik (sidebar | floating | inset) — geteilt mit dem Dashboard-Layout via Cookie
const sidebarVariant = useCookie<'sidebar' | 'floating' | 'inset'>('maui-sidebar-variant', { default: () => 'floating' })

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

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

// Theme + optionale Variante in einem Schritt setzen (setTheme resettet die Variante)
function selectTheme(id: string, variantId: string | null) {
  setTheme(id)
  if (variantId) setVariant(variantId)
}

const items = computed<SwatchItem[][]>(() => {
  // Jedes Theme; mit Varianten → eigenes Aufklapp-Menü (Standard + Varianten)
  const themeChildren: SwatchItem[] = themes.map((entry) => {
    if (!entry.variants.length) {
      return {
        label: entry.name,
        slot: 'swatch',
        swatchIcon: 'i-ph-palette',
        swatchColor: entry.color,
        type: 'checkbox',
        checked: theme.value.id === entry.id,
        onSelect: (event: Event) => { event.preventDefault(); selectTheme(entry.id, null) },
      }
    }
    return {
      label: entry.name,
      slot: 'swatch',
      swatchIcon: 'i-ph-palette',
      swatchColor: entry.color,
      children: [
        {
          label: t('themes.variantDefault'),
          slot: 'swatch',
          swatchIcon: 'i-ph-swatches',
          swatchColor: entry.color,
          type: 'checkbox',
          checked: theme.value.id === entry.id && variant.value === null,
          onSelect: (event: Event) => { event.preventDefault(); selectTheme(entry.id, null) },
        },
        ...entry.variants.map(v => ({
          label: capitalize(v.id),
          slot: 'swatch',
          swatchIcon: 'i-ph-swatches',
          swatchColor: v.color,
          type: 'checkbox' as const,
          checked: theme.value.id === entry.id && variant.value === v.id,
          onSelect: (event: Event) => { event.preventDefault(); selectTheme(entry.id, v.id) },
        })),
      ],
    }
  })

  const neutralChildren: SwatchItem[] = neutrals.map(n => ({
    label: capitalize(n.id),
    slot: 'swatch',
    swatchIcon: 'i-ph-circle-fill',
    swatchColor: n.color,
    type: 'checkbox',
    checked: neutral.value === n.id,
    onSelect: (event: Event) => { event.preventDefault(); setNeutral(n.id) },
  }))

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

  const sidebarChildren: DropdownMenuItem[] = (['sidebar', 'floating', 'inset'] as const).map(value => ({
    label: t(`dashboard.sidebar.${value}`),
    type: 'checkbox',
    checked: sidebarVariant.value === value,
    onSelect: (event: Event) => { event.preventDefault(); sidebarVariant.value = value },
  }))

  const languageChildren: DropdownMenuItem[] = localeOptions.value.map(option => ({
    label: option.label,
    icon: option.flag,
    type: 'checkbox',
    checked: locale.value === option.code,
    onSelect: (event: Event) => { event.preventDefault(); setLocale(option.code as typeof locale.value) },
  }))

  return [
    [{ type: 'label', label: displayName.value, avatar: avatar.value }],
    [{ label: t('dashboard.settings.title'), icon: 'i-ph-gear', to: localePath('/dashboard/settings') }],
    [
      { label: t('themes.label'), icon: 'i-ph-palette', children: themeChildren },
      { label: t('themes.neutralLabel'), icon: 'i-ph-circle-half', children: neutralChildren },
      { label: t('themes.modeLabel'), icon: 'i-ph-sun-horizon', children: appearanceChildren },
      { label: t('dashboard.sidebar.label'), icon: 'i-ph-sidebar-simple', children: sidebarChildren },
      { label: t('ui.language'), icon: 'i-ph-globe', children: languageChildren },
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

    <template #swatch-leading="{ item }">
      <UIcon
        :name="(item as SwatchItem).swatchIcon ?? ''"
        class="size-5 shrink-0"
        :style="{ color: (item as SwatchItem).swatchColor }"
      />
    </template>
  </UDropdownMenu>
</template>
