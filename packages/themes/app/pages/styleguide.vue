<script setup lang="ts">
/**
 * Theme-Styleguide / Demo-Page: zeigt die wichtigsten Nuxt-UI-Components in ihren
 * Zuständen + ein Live-Panel mit den echten Parametern des aktiven Themes
 * (Primary-/Neutral-Ramp, Radius). Über DisplaySettingsMenu (oben rechts) lässt
 * sich Theme/Neutral/Hell-Dunkel live umschalten → alles aktualisiert sofort.
 */
const { theme, variant, neutral } = useTheme()

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

const primaryRamp = ref<{ shade: number, value: string }[]>([])
const neutralRamp = ref<{ shade: number, value: string }[]>([])
const radius = ref('')

function readVars() {
  if (import.meta.server) return
  const s = getComputedStyle(document.documentElement)
  primaryRamp.value = SHADES.map(sh => ({ shade: sh, value: s.getPropertyValue(`--ui-color-primary-${sh}`).trim() }))
  neutralRamp.value = SHADES.map(sh => ({ shade: sh, value: s.getPropertyValue(`--ui-color-neutral-${sh}`).trim() }))
  radius.value = s.getPropertyValue('--ui-radius').trim() || '—'
}

onMounted(readVars)
// Theme/Variant/Neutral-Wechsel → kurz warten, bis die CSS-Vars greifen, dann neu lesen
watch([theme, variant, neutral], () => setTimeout(readVars, 60))

const colors = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
const variants = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'] as const
const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const

const checkbox = ref(true)
const switchOn = ref(true)
const radio = ref('a')
const text = ref('')
const select = ref('one')
const range = ref(60)
const modalOpen = ref(false)

const tabs = [
  { label: 'Account', icon: 'i-ph-user', slot: 'a' as const },
  { label: 'Passwort', icon: 'i-ph-lock', slot: 'b' as const },
  { label: 'Benachrichtigungen', icon: 'i-ph-bell', slot: 'c' as const },
]
const accordion = [
  { label: 'Was ist Maui?', icon: 'i-ph-info', content: 'Ein Nuxt-4-Monorepo mit Core + Feature-Layern.' },
  { label: 'Wie funktionieren Themes?', icon: 'i-ph-palette', content: 'Primary-Ramp via data-theme, Neutral via data-neutral, Hell/Dunkel separat.' },
]
const dropdown = [[
  { label: 'Profil', icon: 'i-ph-user' },
  { label: 'Einstellungen', icon: 'i-ph-gear' },
], [
  { label: 'Abmelden', icon: 'i-ph-sign-out', color: 'error' as const },
]]
</script>

<template>
  <UContainer class="space-y-10 py-8">
    <!-- Kopf + Switcher -->
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Theme-Styleguide</h1>
        <p class="text-sm text-muted">
          Aktiv: <span class="font-medium text-default">{{ theme.name }}</span>
          <template v-if="variant"> · Variante {{ variant }}</template>
          · Neutral {{ neutral }}
        </p>
      </div>
      <DisplaySettingsMenu />
    </header>

    <!-- Live-Theme-Parameter -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold">Theme-Parameter (live)</h2>
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <p class="mb-2 text-sm font-medium text-muted">Primary-Ramp · Radius {{ radius }}</p>
          <div class="flex overflow-hidden rounded-lg ring ring-default">
            <div
              v-for="c in primaryRamp" :key="c.shade"
              class="group relative h-12 flex-1" :style="{ backgroundColor: c.value }"
              :title="`primary-${c.shade}: ${c.value}`"
            />
          </div>
          <div class="mt-1 flex text-[10px] text-dimmed">
            <span v-for="c in primaryRamp" :key="c.shade" class="flex-1 text-center">{{ c.shade }}</span>
          </div>
        </div>
        <div>
          <p class="mb-2 text-sm font-medium text-muted">Neutral-Ramp</p>
          <div class="flex overflow-hidden rounded-lg ring ring-default">
            <div
              v-for="c in neutralRamp" :key="c.shade"
              class="h-12 flex-1" :style="{ backgroundColor: c.value }"
              :title="`neutral-${c.shade}: ${c.value}`"
            />
          </div>
          <div class="mt-1 flex text-[10px] text-dimmed">
            <span v-for="c in neutralRamp" :key="c.shade" class="flex-1 text-center">{{ c.shade }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Buttons -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold">Buttons</h2>
      <div v-for="v in variants" :key="v" class="flex flex-wrap items-center gap-2">
        <span class="w-16 text-xs text-muted">{{ v }}</span>
        <UButton v-for="c in colors" :key="c" :color="c" :variant="v" :label="c" />
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-2">
        <UButton v-for="s in sizes" :key="s" :size="s" label="Size" icon="i-ph-rocket-launch" />
        <UButton loading label="Loading" />
        <UButton disabled label="Disabled" />
      </div>
    </section>

    <!-- Formular -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold">Formular</h2>
      <div class="grid max-w-2xl gap-4 sm:grid-cols-2">
        <UFormField label="Text">
          <UInput v-model="text" placeholder="Tippen…" icon="i-ph-pencil" class="w-full" />
        </UFormField>
        <UFormField label="Select">
          <USelect v-model="select" :items="[{ label: 'Eins', value: 'one' }, { label: 'Zwei', value: 'two' }]" class="w-full" />
        </UFormField>
        <UFormField label="Checkbox / Switch">
          <div class="flex items-center gap-4">
            <UCheckbox v-model="checkbox" label="Aktiv" />
            <USwitch v-model="switchOn" />
          </div>
        </UFormField>
        <UFormField label="Radio">
          <URadioGroup v-model="radio" :items="[{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]" orientation="horizontal" />
        </UFormField>
        <UFormField label="Slider" class="sm:col-span-2">
          <USlider v-model="range" />
        </UFormField>
      </div>
    </section>

    <!-- Feedback -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold">Feedback</h2>
      <div class="flex flex-wrap gap-2">
        <UBadge v-for="c in colors" :key="c" :color="c" :label="c" variant="subtle" />
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <UAlert color="info" variant="subtle" icon="i-ph-info" title="Info" description="Eine informative Meldung." />
        <UAlert color="success" variant="subtle" icon="i-ph-check-circle" title="Erfolg" description="Hat geklappt." />
        <UAlert color="warning" variant="subtle" icon="i-ph-warning" title="Warnung" description="Achtung." />
        <UAlert color="error" variant="subtle" icon="i-ph-x-circle" title="Fehler" description="Etwas lief schief." />
      </div>
      <UProgress :model-value="range" />
    </section>

    <!-- Daten + Overlays -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold">Daten & Overlays</h2>
      <div class="grid gap-4 md:grid-cols-3">
        <UCard>
          <template #header><span class="font-medium">Card</span></template>
          <div class="flex items-center gap-3">
            <UAvatar icon="i-ph-user" />
            <div>
              <p class="text-sm font-medium">David Schubert</p>
              <p class="text-xs text-muted">Admin</p>
            </div>
          </div>
          <template #footer>
            <div class="flex gap-2">
              <UButton size="xs" label="Aktion" />
              <UTooltip text="Tooltip-Text"><UButton size="xs" color="neutral" variant="subtle" label="Hover mich" /></UTooltip>
            </div>
          </template>
        </UCard>

        <UCard>
          <template #header><span class="font-medium">Dropdown</span></template>
          <UDropdownMenu :items="dropdown">
            <UButton color="neutral" variant="subtle" label="Menü öffnen" trailing-icon="i-ph-caret-down" />
          </UDropdownMenu>
          <template #footer>
            <UButton label="Modal öffnen" @click="modalOpen = true" />
          </template>
        </UCard>

        <UCard>
          <template #header><span class="font-medium">Avatare</span></template>
          <div class="flex -space-x-2">
            <UAvatar v-for="n in 4" :key="n" :text="String.fromCharCode(64 + n)" class="ring-2 ring-default" />
          </div>
        </UCard>
      </div>
    </section>

    <!-- Navigation -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold">Navigation</h2>
      <UTabs :items="tabs">
        <template #a><p class="p-3 text-sm text-muted">Account-Inhalt.</p></template>
        <template #b><p class="p-3 text-sm text-muted">Passwort-Inhalt.</p></template>
        <template #c><p class="p-3 text-sm text-muted">Benachrichtigungen-Inhalt.</p></template>
      </UTabs>
      <UAccordion :items="accordion" />
    </section>

    <UModal v-model:open="modalOpen" title="Beispiel-Modal">
      <template #body>
        <p class="text-sm">Ein Modal im aktuellen Theme — Primary-Buttons, Radius und Neutral folgen dem Switcher.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Abbrechen" @click="modalOpen = false" />
          <UButton label="Bestätigen" @click="modalOpen = false" />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
