<script setup lang="ts">
/**
 * Einstellungen → Community: die Schalter, die der KUNDIN gehören (nicht dem
 * Betreiber). Erster Bewohner ist „Offene Registrierung" (Audit-Befund S1,
 * Davids Entscheidung 4 vom 2026-07-27) — der Einladungs-Code gilt nur fürs
 * GRÜNDEN einer Community, wer beitreten darf, entscheidet die Community.
 *
 * Nur auf MANDANTEN-Hosts sinnvoll: eine Silo-App oder ein Kontroll-Host hat
 * keine Community-Grenze, dort regelt die Registrierung weiterhin die
 * Instanz-Einstellung (Betreiber-Seite /dashboard/admin/config). Ohne Tenant
 * steht hier deshalb ein Hinweis statt eines Schalters — und der Reiter ist in
 * der Settings-Navigation ausgeblendet.
 *
 * VERTRAG ZUM SERVER: die Route `/api/site/registration` liegt im
 * onboarding-Layer, weil DIESER die Service-Naht zum Control Plane besitzt
 * (`tenants` gehört dorthin, die Platform-App hat nur einen Read-only-Key).
 * Siehe packages/onboarding/server/api/site/registration.patch.ts.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t } = useI18n()
const toast = useToast()

const { openRegistration } = useTenantOpenRegistration()
/** null = kein Mandanten-Host → Schalter hat hier keine Bedeutung. */
const isTenantHost = computed(() => openRegistration.value !== null)

const value = ref(openRegistration.value !== false)
watch(openRegistration, next => { value.value = next !== false })

const saving = ref(false)
async function save(next: boolean) {
  saving.value = true
  try {
    const result = await $fetch<{ openRegistration: boolean }>('/api/site/registration', {
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
    toast.add({ title: t('dashboard.community.saveFailed'), color: 'error' })
  }
  finally {
    saving.value = false
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
  </UPageCard>
</template>
