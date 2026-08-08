<script setup lang="ts">
/**
 * COMMUNITY-EINSTELLUNGEN → ALLGEMEIN: die Schalter, die der KUNDIN gehören
 * (nicht dem Betreiber). Seit F51 (2026-08-07) der INDEX des Community-Hubs
 * (`/dashboard/community`, Reiter „Allgemein") — davor
 * `/dashboard/settings/community` als Reiter der KONTO-Hülle, was die falsche
 * Ebene war. Drei Bewohner:
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
 *
 *  3. „Gefahrenzone" (C16, 2026-07-31) — diese Community löschen. OWNER-Sache
 *     (`community.delete`), deshalb eine eigene Karte mit eigener Capability
 *     statt einer Zeile in der ersten. Was der Knopf tut, sagt er selbst:
 *     stilllegen (Host antwortet binnen ≤30 s mit 404) und allen den Zugang
 *     entziehen — INHALTE BLEIBEN. Der bewusste Schnitt „Deaktivieren +
 *     Zugänge entziehen, Daten bleiben" ist bei der puren Regel begründet
 *     (`decideCommunityDeletion`, packages/control/shared/communityTeam.ts).
 *
 * Die ersten beiden sind ZUGANGSREGELN. Die Karte „Erscheinungsbild" (Davids
 * Entscheidung 12 vom 2026-07-28) ist seit F5 (2026-07-31) auf eine EIGENE
 * Seite umgezogen —
 * `/dashboard/community/branding` im onboarding-Layer, unter der Capability,
 * der sie gehört (`branding.manage` statt
 * `team.manage`). Umgezogen, NICHT kopiert: zwei Flächen für dieselbe Wahl
 * wären Doppelpflege. Begründung des Schnitts (Wahl vs. Katalog) steht im Kopf
 * von packages/onboarding/app/pages/dashboard/community/branding.vue.
 *
 * ── WARUM IM ONBOARDING-LAYER (F24, 2026-08-02) ────────────────────────────
 * Alle drei Routen dieser Seite (`/api/community/registration`,
 * `/api/community/audience`, `/api/community/delete`) liegen hier, weil DIESER
 * Layer die Service-Naht zum Control Plane besitzt (`communities` gehört
 * dorthin, die Platform-App hat nur einen Read-only-Key). Siehe
 * packages/onboarding/server/api/community/{registration.patch,audience.patch,
 * delete.post}.ts.
 *
 * Die Seite lag bis zum 2026-08-02 im admin-Layer und rief von dort aus
 * ausschließlich fremde Routen — derselbe Schnitt-Fehler, wegen dem schon
 * die Mitglieder-Seite (S9) und das Branding (F5) umgezogen sind: eine
 * Seite kann nur so weit reichen wie ihre Routen. Eine Silo-App ohne
 * onboarding (comments, photos, portfolio, control) trug den Reiter also im
 * Bauplan und verließ sich darauf, dass eine LAUFZEIT-Beobachtung
 * (`isTenantHost`) ihn wegblendet. Jetzt gibt es dort weder Seite noch Reiter.
 *
 * Der Reiter selbst kommt aus der Registry `pukalani.admin.communityTabs`
 * (core/shared/types/settings-tab.ts), registriert in
 * packages/onboarding/app/app.config.ts — genau wie seine vier Geschwister
 * Branding, Mitglieder, Domain und Plan.
 *
 * Der Hinweis statt der Schalter BLEIBT trotzdem: `scope: 'community'` hält
 * den Reiter von einem Kontroll-Host fern, aber die Seite ist über ihre URL
 * weiterhin erreichbar (und `apps/platform` bedient Kontroll- UND
 * Mandanten-Hosts aus derselben App). Eine Seite, die dort mit toten Schaltern
 * dastünde, wäre schlechter als eine, die sagt, warum sie leer ist.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t } = useI18n()
const toast = useToast()

useHead({ title: () => t('dashboard.settings.community') })

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

// ── Gefahrenzone: diese Community löschen (C16) ─────────────────────────────

/**
 * OWNER-Sache (`community.delete`), nicht `team.manage` — ein Admin führt die
 * Verwaltung, aber er legt die Community nicht still. Die Karte verschwindet
 * für ihn ganz; die AUTORITÄT ist `requireCommunityPermission` auf der Route
 * und das Control Plane, das die Regel noch einmal selbst prüft.
 */
const canDelete = useCommunityCapability('community.delete')
const confirm = useConfirm()
/** Anzeigename dieser Community (mit Fallback auf den App-Brand). Er gehört in
 *  die Rückfrage — „diese Community" ist kein Gegenstand, den man
 *  wiedererkennt, und genau daran hängt eine unumkehrbar wirkende Zusage. */
const communityName = useBrandName()

const deleting = ref(false)
/** true = in dieser Sitzung stillgelegt (der Host antwortet gleich mit 404). */
const deleted = ref(false)

/**
 * Was der Klick WIRKLICH tut, steht im Dialog und noch einmal im Toast:
 * stilllegen + allen den Zugang nehmen, Inhalte bleiben. Ein „Löschen", das
 * in Wahrheit etwas anderes tut, wäre die schlimmste Sorte Knopf — deshalb
 * nennt der Text beides, die Wirkung UND die Grenze.
 */
async function deleteCommunity() {
  if (deleting.value || deleted.value) return
  const ok = await confirm({
    title: t('dashboard.community.danger.confirmTitle', { name: communityName.value }),
    description: t('dashboard.community.danger.confirmText'),
    confirmLabel: t('dashboard.community.danger.confirm'),
    action: async () => {
      deleting.value = true
      await $fetch('/api/community/delete', { method: 'POST' })
    },
  }).catch((error: unknown) => {
    // FACHLICHE Gründe reisen als `data.reason` (core/server/error.ts hebt
    // `data.code` ins Envelope) — alles andere ist ein echter Fehler.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    const known = reason === 'subscription_active' || reason === 'already_disabled' || reason === 'owner_protected'
    toast.add({
      title: known ? t(`dashboard.community.danger.errors.${reason}`) : t('dashboard.community.saveFailed'),
      description: known ? undefined : t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
    return false
  }).finally(() => { deleting.value = false })

  if (!ok) return
  deleted.value = true
  toast.add({
    title: t('dashboard.community.danger.done'),
    description: t('dashboard.community.danger.doneDesc'),
    color: 'success',
  })
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

  <!-- Gefahrenzone (C16): eigene Karte, eigene Capability (Owner). Bewusst UNTEN
       und optisch abgesetzt — und bewusst NICHT ausgegraut versteckt: was es
       nicht gibt, gehört gar nicht ins Bild; was es gibt, muss ehrlich sagen,
       was es tut. -->
  <UPageCard
    v-if="isTenantHost && canDelete"
    :title="t('dashboard.community.danger.title')"
    :description="t('dashboard.community.danger.description')"
    variant="subtle"
    class="ring-error/30"
  >
    <div class="flex flex-wrap items-center justify-between gap-4" data-community-danger>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-warning-octagon" class="mt-0.5 size-5 shrink-0 text-error" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.danger.what') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.danger.keeps') }}</p>
        </div>
      </div>
      <UButton
        color="error"
        variant="subtle"
        icon="i-ph-trash"
        :loading="deleting"
        :disabled="deleted"
        data-community-delete
        @click="deleteCommunity"
      >
        {{ t('dashboard.community.danger.cta') }}
      </UButton>
    </div>

    <UAlert
      v-if="deleted"
      color="warning"
      variant="subtle"
      icon="i-ph-moon"
      :title="t('dashboard.community.danger.done')"
      :description="t('dashboard.community.danger.doneDesc')"
    />
  </UPageCard>
</template>
