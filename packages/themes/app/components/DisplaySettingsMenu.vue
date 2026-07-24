<script setup lang="ts">
// Anzeige-Einstellungen (Theme + Varianten, Appearance, Sprache) als Dropdown —
// gleicher Aufbau wie das Account-Menü im Dashboard, für den Header der
// öffentlichen Seiten (ersetzt dort das Floating-Widget).
import type { DropdownMenuItem } from '@nuxt/ui'

type SwatchItem = DropdownMenuItem & { swatchIcon?: string, swatchColor?: string }

const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()
const { theme, variant, neutrals, neutral, setNeutral } = useTheme()
const localeOptions = useLocaleOptions()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

// 26×11 (E7b): das Theme wird nicht mehr im Dropdown gewählt (26 Themes ×
// 11er-Untermenü ist unbedienbar), sondern im Grid-Modal — der Menü-Eintrag
// zeigt die aktive Wahl (Name + Swatch) und öffnet den Picker.
const pickerOpen = ref(false)

const items = computed<SwatchItem[][]>(() => {
  const activeColor = variant.value
    ? theme.value.variants.find(v => v.id === variant.value)?.color ?? theme.value.color
    : theme.value.color
  const themeChildren: SwatchItem[] = [{
    label: variant.value ? `${theme.value.name} · ${capitalize(variant.value)}` : theme.value.name,
    slot: 'swatch',
    swatchIcon: 'i-ph-palette',
    swatchColor: activeColor,
    onSelect: () => { pickerOpen.value = true },
  }]

  const neutralChildren: SwatchItem[] = neutrals.value.map(n => ({
    label: n.tinted ? t('themes.neutralTinted') : capitalize(n.id),
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
  <!-- Grid-Picker lebt NEBEN dem Dropdown (nicht darin): das Dropdown schließt
       beim Klick, das Modal bleibt eigenständig offen (Reka-Teleport) -->
  <ThemePickerModal v-model:open="pickerOpen" />
</template>
