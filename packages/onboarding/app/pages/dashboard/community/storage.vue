<script setup lang="ts">
import { usagePercent, type CommunityUsageResponse } from '../../../../shared/communityUsage'

/**
 * COMMUNITY-EINSTELLUNGEN → SPEICHER: der eigene Verbrauch gegen das
 * Kontingent des Tarifs (F51 Paket 2, 2026-08-07).
 *
 * ── WOFÜR DIESE SEITE DA IST ───────────────────────────────────────────────
 * Bis hierher war das Kontingent eine STILLE Grenze: die Bremse
 * (`assertPoolWriteQuota`) antwortet 429, und seit 2026-07-29 sagt sie über
 * `reason: quota_reached` immerhin, dass es der Tarif war und nicht die
 * Geschwindigkeit — aber wie viel noch übrig ist, stand nirgends. Diese Seite
 * ist die Antwort auf „wie nah bin ich dran?", bevor jemand dagegenläuft.
 *
 * ── WAS HIER BEWUSST FEHLT ─────────────────────────────────────────────────
 *  · **Das TAGESLIMIT** (`perDay`). Es ist eine rollierende 24-Stunden-
 *    Zählung: sie bräuchte je Posten eine zweite Abfrage und wäre eine Minute
 *    später eine andere Zahl. Ein Balken, der ohne Zutun zurückläuft, erklärt
 *    weniger, als er verwirrt. Begründung ausführlich bei `selectUsagePosts`
 *    (shared/communityUsage.ts).
 *  · **Bytes.** Gezählt werden ZEILEN. Für Kommentare und Termine ist das
 *    dasselbe; für die Mediathek ist es ein Stellvertreter (die echten Kosten
 *    sind die Datei auf der geteilten Platte — Umrechnung an der `media`-Zeile
 *    in apps/platform/app/app.config.ts). Deshalb steht auf dieser Seite
 *    nirgends „MB": der Posten heißt „Bilder", nicht „Speicherplatz".
 *  · **Posten ohne Kontingent.** „12 von unbegrenzt" ist keine Auskunft.
 *
 * ── FAIL-SOFT ──────────────────────────────────────────────────────────────
 * Ein Produkt, das diese App gar nicht komponiert (oder dessen Tabelle nicht
 * antwortet), hat keinen Eintrag — nicht eine glatte 0. Der Unterschied ist
 * nicht kosmetisch: 0 behauptet „du hast noch nichts angelegt", wo „ich weiß
 * es nicht" richtig wäre. Die Regel dazu ist pur und getestet.
 *
 * `team.manage` wie bei den Geschwister-Reitern: wer das Team verwaltet, darf
 * auch wissen, wie voll die Community ist. Die Autorität ist
 * `requireCommunityPermission` auf `/api/community/usage`.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t, te, locale } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('onboarding.communityStorage.title') })

const { plan } = useTenantPlan()
/** null = kein Pool-Mandant (Silo, Kontroll-Host) — dort gibt es kein Kontingent. */
const isTenantHost = computed(() => plan.value !== null)

const { data, status } = await useFetch<CommunityUsageResponse>('/api/community/usage', {
  default: () => ({ plan: '', posts: [] }),
})

/**
 * Der Name eines Postens kommt aus i18n, der Schlüssel aus der Registry — und
 * die beiden können auseinanderlaufen, wenn ein Layer einen neuen Posten
 * anmeldet. Dann steht hier der ROHE Schlüssel statt eines erfundenen Textes:
 * ein sichtbar unübersetzter Posten fällt auf, ein stiller Rückfall auf
 * „Kommentare" wäre schlicht falsch (dieselbe Lehre wie bei den
 * Glocken-Texten, core/tests/notificationBellTexts.test.ts).
 */
function postLabel(kind: string): string {
  const key = `onboarding.communityStorage.posts.${kind}`
  return te(key) ? t(key) : kind
}

/**
 * Tausender-Trennung MIT AUSDRÜCKLICHER Sprache.
 *
 * `toLocaleString()` ohne Argument nimmt die Umgebungs-Sprache — auf dem Server
 * die von Node, im Browser die des Nutzers. Aus 5000 würde SSR-seitig „5,000"
 * und nach der Hydration „5.000": ein Hydration-Mismatch mitten in einer Zahl,
 * und zwar einer, die niemand als Fehler erkennt. Die Sprache kommt deshalb aus
 * i18n, die an beiden Enden dieselbe ist.
 */
function num(value: number): string {
  return value.toLocaleString(locale.value)
}

/** Ab 90 % färbt sich der Balken — vorher ist die Zahl Information, nicht Alarm. */
function postColor(percent: number): 'primary' | 'warning' | 'error' {
  if (percent >= 100) return 'error'
  return percent >= 90 ? 'warning' : 'primary'
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="!isTenantHost"
      icon="i-ph-info"
      color="neutral"
      variant="subtle"
      :title="t('onboarding.communityStorage.noTenantTitle')"
      :description="t('onboarding.communityStorage.noTenantDesc')"
    />

    <UPageCard
      v-else
      :title="t('onboarding.communityStorage.title')"
      :description="t('onboarding.communityStorage.description')"
      variant="subtle"
    >
      <CoreEmptyState
        v-if="status !== 'pending' && !data?.posts?.length"
        icon="i-ph-gauge"
        :title="t('onboarding.communityStorage.emptyTitle')"
        :description="t('onboarding.communityStorage.emptyDesc')"
      />

      <div v-else class="space-y-5">
        <div
          v-for="post in data?.posts"
          :key="post.kind"
          :data-usage-post="post.kind"
        >
          <div class="mb-1.5 flex items-baseline justify-between gap-4">
            <p class="text-sm font-medium">{{ postLabel(post.kind) }}</p>
            <p class="text-sm text-muted tabular-nums">
              {{ t('onboarding.communityStorage.of', { used: num(post.total), limit: num(post.limit) }) }}
            </p>
          </div>
          <UProgress
            :model-value="usagePercent(post)"
            :max="100"
            :color="postColor(usagePercent(post))"
            size="sm"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-muted">{{ t('onboarding.communityStorage.hint') }}</p>
          <UButton
            :to="localePath('/dashboard/community/plan')"
            color="neutral"
            variant="subtle"
            size="sm"
            icon="i-ph-credit-card"
          >
            {{ t('onboarding.communityStorage.planCta') }}
          </UButton>
        </div>
      </template>
    </UPageCard>
  </div>
</template>
