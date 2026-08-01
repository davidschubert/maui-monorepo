<script setup lang="ts">
/**
 * Einstellungen → Community: die Schalter, die der KUNDIN gehören (nicht dem
 * Betreiber). Drei Bewohner:
 *
 *  1. „Offene Registrierung" (Audit-Befund S1, Davids Entscheidung 4 vom
 *     2026-07-27) — der Einladungs-Code gilt nur fürs GRÜNDEN einer
 *     Community, wer beitreten darf, entscheidet die Community.
 *     Seit A5 (2026-07-29) steuert DIESER Schalter auch die MITGLIEDSCHAFT, nicht
 *     mehr nur die Kontoanlage: an heißt „wer sich hier anmeldet oder das erste
 *     Mal mitschreibt, wird Mitglied", aus heißt „nur per Einladung"
 *     (packages/core/shared/communityJoin.ts). Deshalb ist die Beschreibung im
 *     Schalter ausführlicher als bei einem gewöhnlichen Ja/Nein — sie muss beide
 *     Folgen benennen.
 *  2. „Sichtbarkeit" (C18, Davids Entscheidung vom 2026-07-30) — öffentlich
 *     lesbar oder nur für Mitglieder. Steht BEWUSST in derselben Karte wie die
 *     Registrierung: beides sind Zugangsregeln, keine Optik. Als URadioGroup
 *     und nicht als Schalter, weil die zwei Zustände beide einen NAMEN
 *     verdienen — ein Schalter „Sichtbarkeit: an" sagt nicht, was aus ist.
 *     Was daran hängt, sagt der Hinweistext, und er sagt auch das
 *     Unangenehme: Suchmaschinen brauchen Tage, bis Bekanntes verschwindet.
 *     Der Schreibvorgang zieht den BESTAND mit um (Row-Permissions) — deshalb
 *     kann er ein paar Sekunden dauern und meldet Zahlen zurück; bleibt etwas
 *     offen, sagt der Toast es und ein erneuter Klick setzt fort.
 *  3. „Erscheinungsbild" (Davids Entscheidung 12 vom 2026-07-28) — Theme +
 *     Variante der Community. „Nur Erscheinung ist variabel" gehört damit in
 *     Kundenhand; der Custom-Theme-EDITOR bleibt Betreiber-Werkzeug
 *     (/dashboard/themes, system.manage), hier wird aus dem BUILT-IN-Katalog
 *     gewählt (26 Welten × Varianten, derselbe öffentliche Grid-Picker).
 *     Seit dem 2026-07-29 (Davids Entscheidung, Rest von OPEN-ITEMS B5) steht
 *     darunter EIN Feld mehr: die NEUTRAL-PALETTE (`data-neutral`, die gedeckte
 *     Grau-Tönung). Sie folgte bis dahin dem Besucher — nicht aus Überzeugung,
 *     sondern weil es dafür keine Community-Einstellung gab. Bewusst als eigene
 *     Zeile und NICHT im Grid-Picker: es ist eine eigene Achse (jede Farbwelt
 *     lässt sich mit jeder Palette kombinieren), und ein zweites Raster im
 *     selben Modal wäre die Art Regler-Zoo, die THEMES-CONCEPT-V2 ablehnt.
 *     NICHT hier und bewusst Besucher-Wahl: Hell/Dunkel und die Sprache.
 *
 * Nur auf MANDANTEN-Hosts sinnvoll: eine Silo-App oder ein Kontroll-Host hat
 * keine Community-Grenze, dort regeln Registrierung und Optik weiterhin die
 * Instanz-Einstellungen (Betreiber-Seiten /dashboard/admin/config bzw.
 * /dashboard/themes). Ohne Tenant steht hier deshalb ein Hinweis statt der
 * Schalter — und der Reiter ist in der Settings-Navigation ausgeblendet.
 *
 * VERTRAG ZUM SERVER: alle drei Routen (`/api/community/registration`,
 * `/api/community/audience`, `/api/community/branding`) liegen im
 * onboarding-Layer, weil DIESER die Service-Naht zum Control Plane besitzt
 * (`communities` gehört dorthin, die Platform-App hat nur einen
 * Read-only-Key). Siehe packages/onboarding/server/api/community/
 * {registration.patch,audience.patch,branding.patch}.ts.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t } = useI18n()
const toast = useToast()

const { openRegistration } = useTenantOpenRegistration()
/** null = kein Mandanten-Host → die Schalter haben hier keine Bedeutung. */
const isTenantHost = computed(() => openRegistration.value !== null)

const value = ref(openRegistration.value !== false)
watch(openRegistration, next => { value.value = next !== false })

const saving = ref(false)
async function save(next: boolean) {
  saving.value = true
  try {
    const result = await $fetch<{ openRegistration: boolean }>('/api/community/registration', {
      method: 'PATCH',
      body: { openRegistration: next },
    })
    // Aus der ANTWORT übernehmen, nicht aus dem Klick: das Control Plane ist
    // die Wahrheit. Der SSR-Wert stammt aus dem Resolver-Cache der Platform-App
    // (≤30 s) — ohne diese Zeile würde ein Reload kurzzeitig das Alte zeigen.
    openRegistration.value = result.openRegistration
    value.value = result.openRegistration
    toast.add({ title: t('dashboard.community.saved'), color: 'success' })
  }
  catch {
    value.value = openRegistration.value !== false
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

// ── Sichtbarkeit (C18) ──────────────────────────────────────────────────────

/** Ergebnis des Bestands-Umzugs, wie ihn die Route zurückmeldet. */
interface AudienceResult {
  audience: 'members' | 'public'
  repermission: { complete: boolean, changed: number, failed: number }
}

const { audience } = useTenantAudience()
const audienceValue = ref<'members' | 'public'>(audience.value ?? 'public')
watch(audience, (next) => { audienceValue.value = next ?? 'public' })

const audienceOptions = computed(() => [
  {
    value: 'public',
    label: t('dashboard.community.audience.public'),
    description: t('dashboard.community.audience.publicDesc'),
  },
  {
    value: 'members',
    label: t('dashboard.community.audience.members'),
    description: t('dashboard.community.audience.membersDesc'),
  },
])

const savingAudience = ref(false)
async function saveAudience(next: 'members' | 'public') {
  if (savingAudience.value || next === audience.value) return
  savingAudience.value = true
  try {
    const result = await $fetch<AudienceResult>('/api/community/audience', {
      method: 'PATCH',
      body: { audience: next },
    })
    // Wie bei den anderen Schaltern: der gültige Wert kommt aus der ANTWORT.
    audience.value = result.audience
    audienceValue.value = result.audience
    // Der Umzug des Bestands kann an einem Zeitbudget enden oder an einzelnen
    // Zeilen scheitern. Das zu verschweigen wäre das Schlimmste, was diese
    // Seite tun könnte — „geschlossen" muss geschlossen heißen.
    if (result.repermission.complete) {
      toast.add({
        title: t('dashboard.community.audience.saved'),
        description: t('dashboard.community.audience.savedDesc', { n: result.repermission.changed }),
        color: 'success',
      })
    }
    else {
      toast.add({
        title: t('dashboard.community.audience.partialTitle'),
        description: t('dashboard.community.audience.partialDesc', { n: result.repermission.changed }),
        color: 'warning',
      })
    }
  }
  catch {
    audienceValue.value = audience.value ?? 'public'
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    savingAudience.value = false
  }
}

// ── Erscheinungsbild ────────────────────────────────────────────────────────

/**
 * Eigene Capability (nicht `team.manage`): Branding und Team sind in der
 * Site-Rollen-Matrix getrennte Rechte. Heute tragen beide dieselben Rollen
 * (owner + admin) — geprüft wird trotzdem das RICHTIGE, damit eine spätere
 * Rolle „nur Gestaltung" oder „nur Team" hier nicht falsch landet. Die
 * AUTORITÄT bleibt requireCommunityPermission auf der Route.
 */
const canBranding = useCommunityCapability('branding.manage')
const { branding } = useTenantBranding()

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
    // Wie beim Registrierungs-Schalter: der geschriebene Wert kommt aus der
    // ANTWORT. Der Resolver-Cache der Platform-App hält den alten Stand noch
    // bis zu 30 s — die öffentliche Community färbt sich also gleich um, aber
    // nicht in derselben Sekunde. Genau das sagt der Hinweis unten.
    branding.value = { theme: result.theme, variant: result.variant, neutral: result.neutral }
    // Der Hinweis auf die halbe Minute steht zwar auf der Karte — nach dem
    // Speichern aus dem Modal heraus ist der Toast aber das, was man ansieht.
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
  <UPageCard
    :title="t('dashboard.community.title')"
    :description="t('dashboard.community.description')"
    variant="subtle"
  >
    <UAlert
      v-if="!isTenantHost"
      color="neutral"
      variant="subtle"
      icon="i-ph-info"
      :title="t('dashboard.community.noTenantTitle')"
      :description="t('dashboard.community.noTenantText')"
    />

    <div v-else class="flex items-center justify-between gap-4" data-community-registration>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-user-plus" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.openRegistration') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.openRegistrationDesc') }}</p>
        </div>
      </div>
      <!-- Der neue Wert kommt aus dem EVENT, nicht aus `value`: die Reihenfolge
           von v-model-Zuweisung und Emit ist nichts, worauf man sich verlassen
           sollte. -->
      <USwitch
        v-model="value"
        :disabled="saving"
        :aria-label="t('dashboard.community.openRegistration')"
        @update:model-value="(next: boolean) => save(next)"
      />
    </div>

    <!-- Sichtbarkeit (C18): zweite Zugangsregel derselben Karte. Zwei benannte
         Zustände statt eines Schalters — und darunter der Satz, der die
         unbequeme Wahrheit sagt (Suchmaschinen brauchen Zeit). -->
    <div v-if="isTenantHost" class="flex flex-col gap-3 border-t border-default pt-4" data-community-audience>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-globe-hemisphere-west" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.audience.title') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.audience.description') }}</p>
        </div>
      </div>
      <URadioGroup
        v-model="audienceValue"
        :items="audienceOptions"
        :disabled="savingAudience"
        variant="card"
        :aria-label="t('dashboard.community.audience.title')"
        @update:model-value="(next) => saveAudience(next as 'members' | 'public')"
      />
      <p class="text-sm text-muted">{{ t('dashboard.community.audience.searchNote') }}</p>
    </div>
  </UPageCard>

  <!-- Erscheinungsbild: eigene Karte, eigene Capability. Auf Nicht-Mandanten-
       Hosts gar nicht erst zeigen — dort gehört die Optik der Instanz. -->
  <UPageCard
    v-if="isTenantHost && canBranding"
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

    <!-- Neutral-Palette (Rest von B5): eigene Achse, eigene Zeile. Chips statt
         Auswahlliste, weil die Grautöne nur als Farbpunkt unterscheidbar sind
         und ein Klick reicht — dieselbe Optik wie die Varianten-Reihe im
         Picker. „Voreinstellung" ist der ehrliche Name für '' (nichts
         gewählt), und der leere Wert kann so gar nicht in ein USelectItem
         geraten. -->
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
         Themes pro Appwrite-PROJEKT liegen und im Pool nicht einem einzelnen
         Mandanten gehören. Der Picker kennt nur Theme+Variante — die Palette
         reicht diese Seite unverändert mit durch. -->
    <ThemePickerModal
      v-if="pickerMounted"
      v-model:open="pickerOpen"
      :selection="selection"
      builtin-only
      :title="t('dashboard.community.appearance.pickerTitle')"
      @select="(next: { theme: string, variant: string }) => saveBranding({ ...next, neutral: selection.neutral })"
    />
  </UPageCard>
</template>
