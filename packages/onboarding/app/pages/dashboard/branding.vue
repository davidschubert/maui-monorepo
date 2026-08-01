<script setup lang="ts">
/**
 * BRANDING EINER COMMUNITY (F5, 2026-07-31) — die Fläche hinter der Nav-Gruppe
 * „Branding" für Community-Rollen.
 *
 * ── DER SCHNITT, UND WARUM ER SO LIEGT ─────────────────────────────────────
 * F5 war als „Themes-Seiten von system.manage auf branding.manage ziehen"
 * notiert. Am Datenmodell nachgemessen geht das NICHT, und zwar nicht aus
 * Bequemlichkeit, sondern weil es ein Mandanten-Leck wäre:
 *
 *  - `custom_themes`, `custom_fonts` und `app_config.themeSettings` sind
 *    INSTANZ-weit (system-Migrationen, Table-read(any), Live-Propagation an
 *    ALLE Communities desselben Appwrite-Projekts). Wer sie bearbeitet,
 *    bearbeitet das Erscheinungsbild des ganzen Pools — Voreinstellung,
 *    Reihenfolge und Namen der Built-ins eingeschlossen. Ein Community-Admin
 *    darf das nie.
 *  - Was einer Community WIRKLICH gehört, sind drei Felder in `communities`
 *    (`theme`, `variant`, `neutral`) — eine WAHL aus dem Built-in-Katalog, kein
 *    Zugriff auf den Katalog. Genau die steht hier.
 *
 * Also: **Wahl = `branding.manage` (diese Seite), Katalog-Verwaltung =
 * `system.manage` (Theme-Studio unter /dashboard/themes, Betreiber)**. Das
 * Theme-Studio ist seit F5 als `scope: 'operator'` registriert und verschwindet
 * damit auf Mandanten-Hosts ganz, statt dort als unerreichbarer Punkt zu stehen.
 *
 * ── WARUM IM ONBOARDING-LAYER ──────────────────────────────────────────────
 * Dieselbe Begründung wie bei der Mitglieder-Seite (A14): eine Seite kann nur so
 * weit reichen wie ihre Routen, und `/api/community/branding` liegt hier — nur
 * dieser Layer besitzt die Service-Naht zum Control Plane, dem `communities`
 * gehört. Läge die Seite im admin-Layer, hätte eine Silo-App ohne onboarding
 * einen Menüpunkt ins Leere.
 *
 * Sie SETZT VORAUS, dass die App auch `themes` und `admin` extended (Registry,
 * ThemePickerModal, `dashboard.community.appearance.*`-Texte) — das tut
 * `apps/platform` als einzige App mit onboarding.
 *
 * ── HERKUNFT ───────────────────────────────────────────────────────────────
 * Der Inhalt stand bis zum 2026-07-31 als dritte Karte in
 * /dashboard/settings/community (Davids Entscheidung 12 vom 2026-07-28). Er ist
 * umgezogen statt kopiert: dort blieben die beiden ZUGANGSREGELN (Registrierung,
 * Sichtbarkeit), hier steht die Optik — und die Nav-Gruppe „Branding" führt
 * endlich irgendwohin. Eine zweite Kopie derselben Fläche wäre genau die
 * Doppelpflege, die „ein Konzept pro Produkt" verbietet.
 *
 * NICHT hier und bewusst Besucher-Wahl: Hell/Dunkel, Seitenleiste, Sprache.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'branding.manage' })

const { t } = useI18n()
const toast = useToast()

useHead({ title: () => t('dashboard.community.appearance.title') })

/** `isTenantHost` = false heißt: kein Mandanten-Host, hier gibt es keine
 *  Community-Farbwelt (die Optik gehört dann der Instanz). */
const { branding, isTenantHost } = useTenantBranding()

// Namen + Farbe der Auswahl kommen aus der Theme-Registry des themes-Layers
// (Auto-Import wie im DashboardUserMenu) — nicht aus einer zweiten Liste hier.
// `neutrals` ist dieselbe Liste, die das öffentliche Anzeige-Menü zeigt; die
// GETÖNTE Ramp eines Custom Themes ist darin nur auf Instanz-Hosts enthalten und
// wird hier ausgefiltert (sie hängt an einer Row, die dem Projekt gehört, nicht
// dem Mandanten — dieselbe Begründung wie `builtin-only` beim Theme-Picker).
const { themes, neutrals } = useTheme()

const selection = computed(() => branding.value ?? { theme: '', variant: '', neutral: '' })
const selectedTheme = computed(() => themes.value.find(entry => entry.id === selection.value.theme) ?? null)
const selectedVariantColor = computed(() =>
  selectedTheme.value?.variants.find(v => v.id === selection.value.variant)?.color
  ?? selectedTheme.value?.color
  ?? null,
)
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
/** '' = nie gewählt → die Instanz-Einstellung gilt (ehrlich benennen). */
const selectionLabel = computed(() => {
  if (!selectedTheme.value) return t('dashboard.community.appearance.inherited')
  return selection.value.variant
    ? `${selectedTheme.value.name} · ${capitalize(selection.value.variant)}`
    : selectedTheme.value.name
})

/**
 * Neutral-Palette: die 9 Registry-Grautöne + „Voreinstellung" ('' = nichts
 * gewählt). Custom-getönte Ramps ('c-<rowId>') fliegen raus — siehe oben.
 * Die Namen (Mist, Taupe, …) sind Eigennamen und laufen wie die Theme-Namen
 * NICHT über i18n.
 */
const neutralOptions = computed(() => neutrals.value.filter(entry => !entry.tinted))
const selectedNeutral = computed(() => neutralOptions.value.find(entry => entry.id === selection.value.neutral) ?? null)

const pickerOpen = ref(false)
// Erst beim ersten Öffnen mounten (Audit-Befund K4) und nie wieder unmounten —
// ein offenes Modal per v-if zu entfernen ist die bekannte Reka-Falle.
const pickerMounted = ref(false)
watch(pickerOpen, (open) => { if (open) pickerMounted.value = true })

const savingBranding = ref(false)
/**
 * IMMER alle drei Achsen schicken (Theme, Variante, Palette): die Route nimmt
 * `neutral` optional an, damit ein Deploy-Fenster zwischen platform und control
 * nichts bricht — aber diese Seite kennt den vollen Zustand und behauptet ihn
 * auch. Wer nur eine Achse ändert, ruft mit `{ ...selection, <achse> }`.
 */
async function saveBranding(next: { theme: string, variant: string, neutral: string }) {
  if (savingBranding.value) return
  savingBranding.value = true
  try {
    const result = await $fetch<{ theme: string, variant: string, neutral: string }>('/api/community/branding', {
      method: 'PATCH',
      body: next,
    })
    // Der geschriebene Wert kommt aus der ANTWORT. Der Resolver-Cache der
    // Platform-App hält den alten Stand noch bis zu 30 s — die öffentliche
    // Community färbt sich also gleich um, aber nicht in derselben Sekunde.
    // Genau das sagt der Hinweis auf der Karte.
    branding.value = { theme: result.theme, variant: result.variant, neutral: result.neutral }
    toast.add({
      title: t('dashboard.community.appearance.saved'),
      description: t('dashboard.community.appearance.savedDesc'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    savingBranding.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="community-branding">
    <template #header>
      <UDashboardNavbar :title="t('dashboard.community.appearance.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <!-- Ohne Mandanten gehört die Optik der Instanz — dort ist das
             Theme-Studio (/dashboard/themes) die richtige Fläche, nicht diese. -->
        <UAlert
          v-if="!isTenantHost"
          color="neutral"
          variant="subtle"
          icon="i-ph-info"
          :title="t('dashboard.community.noTenantTitle')"
          :description="t('branding.noTenantText')"
        />

        <UPageCard
          v-else
          :title="t('dashboard.community.appearance.title')"
          :description="t('dashboard.community.appearance.description')"
          variant="subtle"
        >
          <div class="flex items-center justify-between gap-4" data-community-branding>
            <div class="flex items-start gap-3">
              <span
                v-if="selectedVariantColor"
                class="mt-0.5 size-5 shrink-0 rounded-full shadow-inner ring-1 ring-black/10"
                :style="{ backgroundColor: selectedVariantColor }"
                aria-hidden="true"
              />
              <UIcon v-else name="i-ph-palette" class="mt-0.5 size-5 shrink-0 text-muted" />
              <div>
                <p class="text-sm font-medium" data-community-theme>{{ selectionLabel }}</p>
                <p class="text-sm text-muted">{{ t('dashboard.community.appearance.propagation') }}</p>
              </div>
            </div>
            <UButton
              color="neutral"
              variant="subtle"
              icon="i-ph-swatches"
              :loading="savingBranding"
              @click="pickerOpen = true"
            >
              {{ t('dashboard.community.appearance.change') }}
            </UButton>
          </div>

          <!-- Neutral-Palette (Rest von B5): eigene Achse, eigene Zeile. Chips
               statt Auswahlliste, weil die Grautöne nur als Farbpunkt
               unterscheidbar sind und ein Klick reicht — dieselbe Optik wie die
               Varianten-Reihe im Picker. „Voreinstellung" ist der ehrliche Name
               für '' (nichts gewählt), und der leere Wert kann so gar nicht in
               ein USelectItem geraten. -->
          <div class="flex flex-col gap-2 border-t border-default pt-4" data-community-neutral>
            <div>
              <p class="text-sm font-medium">{{ t('dashboard.community.appearance.neutral') }}</p>
              <p class="text-sm text-muted">{{ t('dashboard.community.appearance.neutralDesc') }}</p>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <UButton
                size="xs"
                color="neutral"
                :variant="selectedNeutral ? 'soft' : 'solid'"
                :disabled="savingBranding"
                @click="saveBranding({ theme: selection.theme, variant: selection.variant, neutral: '' })"
              >
                {{ t('dashboard.community.appearance.neutralInherited') }}
              </UButton>
              <UButton
                v-for="entry in neutralOptions"
                :key="entry.id"
                size="xs"
                color="neutral"
                :variant="selection.neutral === entry.id ? 'solid' : 'soft'"
                :disabled="savingBranding"
                @click="saveBranding({ theme: selection.theme, variant: selection.variant, neutral: entry.id })"
              >
                <span
                  class="size-3 rounded-full ring-1 ring-black/10"
                  :style="{ backgroundColor: entry.color }"
                  aria-hidden="true"
                />
                {{ capitalize(entry.id) }}
              </UButton>
            </div>
          </div>

          <!-- DERSELBE öffentliche Grid-Picker (themes-Layer), nur kontrolliert:
               `selection` macht ihn zum Formularfeld dieser Community, statt das
               Theme-Cookie des Owners umzustellen. `builtin-only`, weil Custom
               Themes pro Appwrite-PROJEKT liegen und im Pool nicht einem
               einzelnen Mandanten gehören. Der Picker kennt nur Theme+Variante —
               die Palette reicht diese Seite unverändert mit durch. -->
          <ThemePickerModal
            v-if="pickerMounted"
            v-model:open="pickerOpen"
            :selection="selection"
            builtin-only
            :title="t('dashboard.community.appearance.pickerTitle')"
            @select="(next: { theme: string, variant: string }) => saveBranding({ ...next, neutral: selection.neutral })"
          />
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
