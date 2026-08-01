<script setup lang="ts">
import { trialNotice } from '../../../control/shared/onboarding'
import type { MyCommunitiesResponse, MyCommunityView } from '../../../control/shared/myCommunities'

/**
 * „Deine Communities" — das Zuhause des Kundenbereichs auf `my.pukalani.app`
 * (F12).
 *
 * DAS PROBLEM, das diese Seite löst: `my.*` hatte keine Landeseite. `/` leitete
 * hart in den Anlege-Wizard, und der Post-Login-Redirect landete über `/`
 * ebenfalls dort — ein Bestandskunde wurde also in seinem eigenen Kundenbereich
 * mit „Neue Community anlegen" begrüßt, statt seine Community zu sehen. Die
 * Roadmap-Zusage „my.* = Kundenbereich" war damit nur halb eingelöst.
 *
 * WER 0 COMMUNITIES HAT, sieht diese Seite gar nicht: sie schickt ihn weiter in
 * den Wizard (`replace`, damit „Zurück" nicht in eine Schleife führt). Das ist
 * das alte Verhalten — und für den Neukunden war es immer richtig.
 *
 * KARTEN STATT `UTable`, bewusst abweichend von Davids Regel B6 (2026-07-30:
 * UTable ist der Standard für Datenlisten). Drei Gründe, alle spezifisch:
 *  1. Die Liste ist per Konstruktion kurz — eigene Communities sind auf 3
 *     gedeckelt (SITE_LIMIT_AFTER_TRIAL). Sortierung, Auswahl und Paginierung
 *     wären Gerüst um zwei Zeilen.
 *  2. Jeder Eintrag ist ein SPRUNG AUF EINEN ANDEREN HOST, kein Datensatz zum
 *     Vergleichen. Was hier gebraucht wird, ist ein großes Klickziel — eine
 *     Tabellenzeile mit Aktions-Menü am rechten Rand verlangt Zielen.
 *  3. Es ist das Erste, was ein Kunde nach der Anmeldung sieht, oft auf dem
 *     Telefon. Eine Tabelle wird dort zur Querscroll-Fläche.
 * Wo dieselben Daten zum VERWALTEN dastehen (`/dashboard/members`), bleibt
 * UTable richtig und steht auch dort.
 *
 * DIE TESTPHASE ERST NACH DER HYDRATION: `trialNotice` rechnet gegen
 * `Date.now()`. Serverseitig gerendert stünde im HTML eine andere Tageszahl als
 * danach im Browser — dieselbe Lehre wie bei CommunityTrialNotice. Deshalb
 * bleibt `now` bis `onMounted` null und die Zeile erscheint einen Frame später.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()

const { data, status } = await useFetch<MyCommunitiesResponse>('/api/onboarding/communities', {
  default: () => ({ communities: [] as MyCommunityView[] }),
})

const communities = computed(() => data.value?.communities ?? [])

/**
 * 0 Communities ⇒ weiter in den Wizard. Läuft schon im SSR (useFetch hat die
 * Antwort dann), es blitzt also keine leere Übersicht auf.
 */
watchEffect(() => {
  if (status.value === 'success' && communities.value.length === 0) {
    void navigateTo(localePath('/start'), { replace: true })
  }
})

const now = ref<number | null>(null)
onMounted(() => { now.value = Date.now() })

function noticeFor(community: MyCommunityView) {
  return now.value === null ? null : trialNotice(community.trialEndsAt, now.value)
}

/**
 * Der Sprung in die Community — EINGELOGGT.
 *
 * Session-Cookies sind host-only, die Anmeldung auf `my.*` gilt auf der
 * Community-Subdomain also nicht. Deshalb wird beim KLICK ein 60-Sekunden-
 * Handoff-Token gesiegelt (nicht beim Rendern: bei einem langsamen Leser wäre
 * es abgelaufen), das der Community-Host gegen Appwrite prüft, bevor er sein
 * Cookie setzt — dasselbe Verfahren wie am Ende des Wizards.
 *
 * Ziel ist `/dashboard`: jede Community-Rolle trägt `dashboard.access`, auch
 * `viewer`. Scheitert der Handoff, führt der Klick trotzdem zur Community —
 * dann eben mit Anmeldung. Ein kaputter Handoff darf keine Sackgasse sein.
 */
const opening = ref<string | null>(null)

async function open(community: MyCommunityView) {
  if (opening.value) return
  opening.value = community.communityId
  let target = `https://${community.host}/dashboard`
  try {
    const { token } = await $fetch<{ token: string }>('/api/onboarding/handoff', {
      method: 'POST',
      body: { communityId: community.communityId },
    })
    target = `https://${community.host}/api/auth/site-session?token=${encodeURIComponent(token)}&to=%2Fdashboard`
  }
  catch {
    // Fallback: ohne Handoff wenigstens zur Community (dort Login).
  }
  window.location.href = target
}

useHead({ title: () => t('onboarding.communities.title') })
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-3">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ t('onboarding.communities.heading') }}
      </h1>
      <p class="text-muted">{{ t('onboarding.communities.intro') }}</p>
    </div>

    <div v-if="status === 'pending' && !communities.length" class="space-y-3">
      <USkeleton v-for="i in 2" :key="i" class="h-28 w-full rounded-xl" />
    </div>

    <!--
      Der Leerzustand ist hier ein SELTENER Fall: 0 Communities leitet weiter,
      und alles andere rendert Karten. Er bleibt trotzdem stehen — für den
      Moment zwischen „geladen" und „weitergeleitet" und für den Fall, dass die
      Weiterleitung blockiert ist.
    -->
    <CoreEmptyState
      v-else-if="!communities.length"
      icon="i-ph-users-three"
      :title="t('onboarding.communities.emptyTitle')"
      :description="t('onboarding.communities.emptyText')"
      :action-label="t('onboarding.communities.create')"
      action-icon="i-ph-plus"
      :action-to="localePath('/start')"
    />

    <ul v-else class="space-y-3" data-my-communities>
      <li v-for="community in communities" :key="community.communityId">
        <button
          type="button"
          class="flex w-full items-center gap-4 rounded-xl border border-default p-5 text-left transition-colors hover:border-primary hover:bg-elevated/50 disabled:opacity-60"
          :disabled="opening !== null"
          :data-community-host="community.host"
          :data-community-role="community.role"
          @click="open(community)"
        >
          <span class="min-w-0 flex-1 space-y-1">
            <span class="flex flex-wrap items-center gap-2">
              <span class="truncate font-semibold">{{ community.name }}</span>
              <UBadge color="neutral" variant="subtle" size="sm">
                {{ t(`members.roles.${community.role}`) }}
              </UBadge>
              <UBadge color="primary" variant="subtle" size="sm" :data-community-plan="community.plan">
                {{ t(`onboarding.subscription.plans.${community.plan}.name`) }}
              </UBadge>
            </span>
            <span class="block truncate text-sm text-muted">{{ community.host }}</span>
            <span
              v-if="noticeFor(community)"
              class="flex items-center gap-1.5 text-sm"
              :class="noticeFor(community)?.kind === 'ending' ? 'text-warning' : 'text-muted'"
              data-community-trial
              :data-trial-kind="noticeFor(community)?.kind"
            >
              <UIcon
                :name="noticeFor(community)?.kind === 'ending' ? 'i-ph-hourglass-medium' : 'i-ph-info'"
                class="size-4 shrink-0"
              />
              {{ noticeFor(community)?.kind === 'ending'
                ? t('onboarding.communities.trialEnding', noticeFor(community)!.daysLeft)
                : t('onboarding.communities.trialEnded') }}
            </span>
          </span>
          <UIcon
            :name="opening === community.communityId ? 'i-ph-circle-notch' : 'i-ph-arrow-right'"
            class="size-5 shrink-0 text-dimmed"
            :class="{ 'animate-spin': opening === community.communityId }"
          />
        </button>
      </li>
    </ul>

    <UButton
      v-if="communities.length"
      :to="localePath('/start')"
      variant="ghost"
      color="neutral"
      icon="i-ph-plus"
      data-create-community
    >
      {{ t('onboarding.communities.create') }}
    </UButton>
  </div>
</template>
