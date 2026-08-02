<script setup lang="ts">
import { ABUSE_CATEGORIES, type AbuseCategory } from '../../../control/shared/abuseReports'

/**
 * Eine Community melden (M13, Auslöser 3) — die öffentliche Seite.
 *
 * OHNE ANMELDUNG, und das ist keine Bequemlichkeit: wer Missbrauch meldet, ist
 * fast nie Mitglied der gemeldeten Community. Ein Konto zur Bedingung zu machen
 * hieße, die meisten Meldungen nie zu bekommen.
 *
 * SIE LIEGT AUF DEM KUNDENBEREICH-HOST (`my.*`/`start.*`), weil der niemandem
 * gehört und deshalb nie gesperrt werden kann — dieselbe Überlegung wie bei
 * `anfragen.vue`. Auf einem lebenden Community-Host rendert sie ebenfalls
 * (Seiten sind nicht auf Kontroll-Hosts beschränkt), auch auf einem wegen
 * Zahlungsverzug nur-lesend gesperrten. Auf einem wegen Missbrauch gesperrten
 * Host gibt es sie nicht — der ist vollständig offline, und über eine bereits
 * abgeschaltete Community muss niemand mehr Meldung erstatten.
 *
 * WAS DIE SEITE NICHT VERSPRICHT: dass etwas passiert. Sie sagt ausdrücklich,
 * dass ein Mensch schaut. Eine Meldung, die automatisch abschaltet, wäre eine
 * Waffe — fünf erfundene Meldungen gegen eine beliebige Community.
 *
 * `?host=` wird vorbefüllt: der Link auf einer Community-Seite kann die Adresse
 * gleich mitbringen, das spart Abtippen. Der Wert ist bewusst NICHT
 * schreibgeschützt — der Melder muss ihn korrigieren können, und geprüft wird
 * er ohnehin serverseitig.
 */
definePageMeta({ layout: 'onboarding' })
defineI18nRoute({ paths: { de: '/missbrauch-melden', en: '/report-abuse' } })

const { t } = useI18n()
const route = useRoute()

const host = ref(typeof route.query.host === 'string' ? route.query.host : '')
const category = ref<AbuseCategory>('other')
const message = ref('')
const url = ref(typeof route.query.url === 'string' ? route.query.url : '')
const reporterEmail = ref('')
/** Honeypot: für Menschen unsichtbar, für Bots verlockend. */
const website = ref('')

const sending = ref(false)
const sent = ref(false)
const failed = ref(false)
const invalidHost = ref(false)

const categoryItems = computed(() =>
  ABUSE_CATEGORIES.map(key => ({ label: t(`onboarding.abuse.categories.${key}`), value: key })))

const canSubmit = computed(() => host.value.trim().length > 0 && message.value.trim().length >= 10)

async function submit() {
  if (!canSubmit.value || sending.value) return
  sending.value = true
  failed.value = false
  invalidHost.value = false
  try {
    await $fetch('/api/abuse/report', {
      method: 'POST',
      body: {
        host: host.value.trim(),
        category: category.value,
        message: message.value.trim(),
        ...(url.value.trim() ? { url: url.value.trim() } : {}),
        ...(reporterEmail.value.trim() ? { reporterEmail: reporterEmail.value.trim() } : {}),
        ...(website.value ? { website: website.value } : {}),
      },
    })
    sent.value = true
  }
  catch (error) {
    // Der EINE unterscheidbare Fehler: die Adresse war keine. Alles andere ist
    // eine Panne, und dafür gibt es genau einen Satz.
    if ((error as { data?: { reason?: string } })?.data?.reason === 'invalid_host') invalidHost.value = true
    else failed.value = true
  }
  finally {
    sending.value = false
  }
}

useHead({ title: () => t('onboarding.abuse.title') })
</script>

<template>
  <div class="space-y-8">
    <template v-if="sent">
      <div class="space-y-3" data-abuse-sent>
        <span class="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <UIcon name="i-ph-shield-check" class="size-6" />
        </span>
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ t('onboarding.abuse.doneTitle') }}</h1>
        <p class="text-muted">{{ t('onboarding.abuse.doneBody') }}</p>
      </div>
      <p class="text-sm text-dimmed">{{ t('onboarding.abuse.doneHint') }}</p>
    </template>

    <template v-else>
      <div class="space-y-3">
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ t('onboarding.abuse.title') }}</h1>
        <p class="text-muted">{{ t('onboarding.abuse.intro') }}</p>
      </div>

      <form class="space-y-5" data-abuse-form @submit.prevent="submit">
        <UFormField :label="t('onboarding.abuse.hostLabel')" :description="t('onboarding.abuse.hostHint')">
          <UInput v-model="host" size="lg" class="w-full font-mono" placeholder="beispiel.pukalani.app" data-abuse-host autofocus />
        </UFormField>

        <UFormField :label="t('onboarding.abuse.categoryLabel')">
          <USelect v-model="category" :items="categoryItems" size="lg" class="w-full" data-abuse-category />
        </UFormField>

        <UFormField :label="t('onboarding.abuse.messageLabel')" :description="t('onboarding.abuse.messageHint')">
          <UTextarea v-model="message" :rows="5" :maxlength="2000" class="w-full" data-abuse-message />
        </UFormField>

        <UFormField :label="t('onboarding.abuse.urlLabel')" :description="t('onboarding.abuse.urlHint')">
          <UInput v-model="url" class="w-full" />
        </UFormField>

        <UFormField :label="t('onboarding.abuse.emailLabel')" :description="t('onboarding.abuse.emailHint')">
          <UInput v-model="reporterEmail" type="email" autocomplete="email" class="w-full" />
        </UFormField>

        <!-- Honeypot: aus dem Layout genommen und für Screenreader versteckt -->
        <div class="hidden" aria-hidden="true">
          <label>
            Website
            <input v-model="website" type="text" tabindex="-1" autocomplete="off">
          </label>
        </div>

        <p v-if="invalidHost" class="flex items-start gap-2 text-sm text-error" data-abuse-invalid-host>
          <UIcon name="i-ph-warning-circle" class="mt-0.5 size-4 shrink-0" />
          {{ t('onboarding.abuse.invalidHost') }}
        </p>
        <p v-else-if="failed" class="flex items-start gap-2 text-sm text-error">
          <UIcon name="i-ph-warning-circle" class="mt-0.5 size-4 shrink-0" />
          {{ t('onboarding.abuse.failed') }}
        </p>

        <UButton type="submit" size="lg" :loading="sending" :disabled="!canSubmit" block data-abuse-submit>
          {{ t('onboarding.abuse.submit') }}
        </UButton>

        <p class="text-xs text-dimmed">{{ t('onboarding.abuse.privacy') }}</p>
      </form>
    </template>
  </div>
</template>
