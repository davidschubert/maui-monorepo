<script setup lang="ts">
/**
 * DER OWNER-SCHALTER (Konzept § 2.6, Davids Entscheidung 4: Default AUS).
 *
 * Als Reiter der Einstellungs-Hülle, dort wo die Community-Verwaltung schon
 * steht. `messages.manage` hat AUSSCHLIESSLICH der Owner — das ist keine
 * Verwaltung dessen, was es gibt, sondern die Entscheidung, ob es einen
 * unbeobachteten Kanal zwischen Mitgliedern überhaupt gibt.
 *
 * ── DER PREIS DES DEFAULTS STEHT AUF DER SEITE ──────────────────────────
 * Das Konzept benennt ihn: „Communities entdecken das Produkt nicht von
 * selbst; es braucht einen sichtbaren Hinweis im Dashboard." Deshalb erklärt
 * dieser Reiter, WAS man einschaltet — und in derselben Zeile, welcher Schutz
 * mitkommt. Ein nackter Schalter ohne diesen Satz wäre entweder gar nicht
 * gefunden oder ohne Nachdenken umgelegt.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'messages.manage' })

const { t } = useI18n()
const toast = useToast()

useHead({ title: () => t('messages.settings.title') })

const { data, refresh } = await useFetch<{ enabled: boolean }>('/api/messages/settings', {
  lazy: true,
  server: false,
  default: () => ({ enabled: false }),
})

const enabled = ref(false)
const pending = ref(false)

watch(data, (value) => { enabled.value = value?.enabled === true }, { immediate: true })

async function save() {
  pending.value = true
  try {
    await $fetch('/api/messages/settings', { method: 'PATCH', body: { enabled: enabled.value } })
    toast.add({ title: t('messages.settings.saved'), color: 'success', icon: 'i-ph-check' })
    await refresh()
  }
  catch {
    toast.add({ title: t('messages.settings.saveFailed'), color: 'error', icon: 'i-ph-warning' })
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UPageCard
    :title="t('messages.settings.title')"
    :description="t('messages.settings.description')"
    variant="subtle"
  >
    <div class="space-y-4">
      <USwitch
        v-model="enabled"
        :label="t('messages.settings.enabled')"
        :description="t('messages.settings.enabledHint')"
      />

      <UAlert
        icon="i-ph-shield-check"
        color="neutral"
        variant="subtle"
        :description="t('messages.settings.protection')"
      />

      <div class="flex justify-end">
        <UButton :label="t('messages.settings.save')" :loading="pending" @click="save" />
      </div>
    </div>
  </UPageCard>
</template>
