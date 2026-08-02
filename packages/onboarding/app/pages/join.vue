<script setup lang="ts">
/**
 * Einladung annehmen — die Landestelle des Mail-Links (`/join?token=…`) UND der
 * Glocken-Meldung (`/join` ohne Token).
 *
 * Zwei Wege, EIN Klick (Davids Entscheidung 2 vom 2026-07-29):
 *  - MIT Token: der Link aus der Mail. Funktioniert auch auf einem Gerät, auf dem
 *    man noch nie angemeldet war — der Auth-Guard schickt über /login zurück
 *    (?redirect=, safeRedirectTarget), danach steht der Knopf hier.
 *  - OHNE Token: wer schon ein Konto hat, findet seine offene Einladung über die
 *    eigene, geprüfte Adresse. Das ist der Fall „Person kennt Pukalani aus einer
 *    anderen Community": anmelden, klicken, drin.
 *
 * Die Seite lebt auf dem COMMUNITY-Host, nicht im Kundenbereich: die
 * Mitgliedschaft gehört dieser Community, und Session-Cookies sind host-gebunden.
 *
 * Bewusst im STANDARD-Layout und nicht im `onboarding`-Layout: das trägt
 * Betreiber-Branding („Pukalani", Plattform-Fußzeile) und gehört damit nicht auf
 * einen Mandanten-Host (N7). Wer eingeladen wird, soll die COMMUNITY sehen, in
 * die er eintritt.
 */
definePageMeta({ middleware: ['auth'] })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()

// Öffentliche Seite auf dem Community-Host → Brand-Kette wie /login (C5).
useBrandTitle(() => t('join.title'))

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null
})

/** Ohne Token: gibt es eine offene Einladung an MEINE Adresse? */
const { data: mine } = await useFetch<{ invites: { id: string, role: string, expiresAt: string }[], siteName: string }>(
  '/api/community/invites/mine',
  { default: () => ({ invites: [], siteName: '' }) },
)

const pending = computed(() => mine.value?.invites?.[0] ?? null)
const siteName = computed(() => mine.value?.siteName ?? '')
/** Etwas anzunehmen gibt es nur mit Token ODER mit gefundener Einladung. */
const hasSomething = computed(() => Boolean(token.value) || Boolean(pending.value))

const busy = ref(false)
const done = ref(false)

/**
 * Die Einladung ist gültig, nur die Adresse ist noch nicht bestätigt
 * (Sicherheits-Audit 2026-08-02). Ein Toast wäre hier falsch: das ist kein
 * Fehler, den man wegklickt, sondern ein Schritt, den man tut. Deshalb bleibt
 * der Hinweis stehen — mitsamt dem Knopf, der die Mail erneut schickt.
 */
const needsVerification = ref(false)

async function accept() {
  busy.value = true
  needsVerification.value = false
  try {
    await $fetch('/api/community/members/accept', {
      method: 'POST',
      body: token.value ? { token: token.value } : { inviteId: pending.value?.id },
    })
    done.value = true
    toast.add({ title: t('join.done'), color: 'success' })
    // Ins Dashboard: die neue Rolle greift dort sofort (die Route prüft sie
    // serverseitig neu), und der Weg „drin sein" ist damit sichtbar zu Ende.
    await navigateTo(localePath('/dashboard'))
  }
  catch (error) {
    const status = (error as { statusCode?: number, status?: number }).statusCode
      ?? (error as { status?: number }).status
    // Der fachliche Grund reist als `reason` im Fehler-Envelope (core/server/
    // error.ts) — quer über die Control-Plane-Naht, die ihn durchreicht.
    const reason = (error as { data?: { reason?: string } }).data?.reason
    if (status === 403 && reason === 'email_unverified') {
      needsVerification.value = true
      return
    }
    toast.add({
      title: status === 403 ? t('join.wrongAccount') : t('join.invalid'),
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UContainer class="py-12">
    <UPageCard
      :title="siteName ? t('join.titleNamed', { name: siteName }) : t('join.title')"
      :description="t('join.description')"
      variant="subtle"
      class="mx-auto max-w-xl"
    >
      <div v-if="hasSomething" class="space-y-4" data-join-accept-box>
        <p v-if="pending" class="text-sm text-muted">
          {{ t('join.roleNote', { role: t(`members.roles.${pending.role}`) }) }}
        </p>
        <AuthEmailVerifyRequired v-if="needsVerification" :title="t('join.verifyFirst')" />
        <UButton :loading="busy" :disabled="done" icon="i-ph-check" data-join-accept @click="accept">
          {{ t('join.accept') }}
        </UButton>
      </div>

      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        icon="i-ph-info"
        :title="t('join.noneTitle')"
        :description="t('join.noneText')"
      />
    </UPageCard>
  </UContainer>
</template>
