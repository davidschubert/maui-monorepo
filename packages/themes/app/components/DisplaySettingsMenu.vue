<script setup lang="ts">
// Anzeige-Einstellungen (Theme + Varianten, Appearance, Sprache) als Dropdown —
// gleicher Aufbau wie das Account-Menü im Dashboard, für den Header der
// öffentlichen Seiten (ersetzt dort das Floating-Widget).
import type { DropdownMenuItem } from '@nuxt/ui'

type SwatchItem = DropdownMenuItem & { swatchIcon?: string, swatchColor?: string }

const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()
const { themes, theme, variant, setTheme, setVariant, neutrals, neutral, setNeutral } = useTheme()
const localeOptions = useLocaleOptions()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

function selectTheme(id: string, variantId: string | null) {
  setTheme(id)
  if (variantId) setVariant(variantId)
}

const items = computed<SwatchItem[][]>(() => {
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
        ...entry.variants.map((v): SwatchItem => ({
          label: capitalize(v.id),
          slot: 'swatch',
          swatchIcon: 'i-ph-swatches',
          swatchColor: v.color,
          type: 'checkbox',
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
    label: t(`themes.appearance.${mode}`),
    icon,
    type: 'checkbox',
    checked: colorMode.preference === mode,
    onSelect: (event: Event) => { event.preventDefault(); colorMode.preference = mode },
  }))

  const languageChildren: DropdownMenuItem[] = localeOptions.value.map(option => ({
    label: option.label,
    icon: option.flag,
    type: 'checkbox',
    checked: locale.value === option.code,
    onSelect: (event: Event) => { event.preventDefault(); setLocale(option.code as typeof locale.value) },
  }))

  return [[
    { label: t('themes.label'), icon: 'i-ph-palette', children: themeChildren },
    { label: t('themes.neutralLabel'), icon: 'i-ph-circle-half', children: neutralChildren },
    { label: t('themes.modeLabel'), icon: 'i-ph-sun-horizon', children: appearanceChildren },
    { label: t('ui.language'), icon: 'i-ph-globe', children: languageChildren },
  ]]
})
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }" :ui="{ content: 'w-52' }">
    <UButton icon="i-ph-palette" color="neutral" variant="ghost" :aria-label="t('themes.label')" />

    <template #swatch-leading="{ item }">
      <UIcon
        :name="(item as SwatchItem).swatchIcon ?? ''"
        class="size-5 shrink-0"
        :style="{ color: (item as SwatchItem).swatchColor }"
      />
    </template>
  </UDropdownMenu>
</template>
