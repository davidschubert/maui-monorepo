<script setup lang="ts">
import { DISCUSSIONS_ABOUT_SLUG, type PublicPage } from '../../../../pages/shared/types/page'
import type { DiscussionAboutResponse } from '../../../../posts/shared/types/post'

/**
 * Die Team-Antwort BEWUSST lokal getippt statt aus `control/shared/communityTeam`
 * importiert: blueprint verdrahtet PRODUKT-Layer, Control Plane und Onboarding
 * gehören ausdrücklich nicht dazu (A14, und ESLint setzt es durch). Dasselbe
 * Verfahren wie bei `PostModerationAssist` in posts — nur die Felder, die diese
 * Seite wirklich liest. Läuft die Antwort auseinander, fehlt hier ein Name; sie
 * kann nicht falsch werden, weil nichts davon geschrieben wird.
 */
interface AboutTeamMember {
  id: string
  name: string
  email: string
  role: string
  status: string
}
interface AboutTeamResponse {
  members: AboutTeamMember[]
}

/**
 * BAUPLAN-Komposition „Über die Diskussionen" (F1 Stufe 2, Konzept § 3.4).
 *
 * Sie liegt in blueprint, weil sie DREI Layer zusammenführt und damit der
 * einzige Ort ist, an dem sie stehen darf (A14): `posts` liefert die Zahlen,
 * `pages` den vom Owner geschriebenen Text, `onboarding` das Team. Keiner der
 * drei darf die anderen kennen — und genau deshalb muss diese Seite mit dem
 * FEHLEN jedes einzelnen umgehen können.
 *
 * ── DREI QUELLEN, DREI ABSTUFUNGEN (alle drei kommen real vor) ─────────────
 *
 * 1. **Zahlen** (`/api/posts/discussions/about`): immer da, sonst gäbe es die
 *    Discussions nicht. Ein Fehler hier ist ein Fehler.
 *
 * 2. **Text** (`/api/pages/public/discussions-about`): fehlt in JEDER App ohne
 *    pages-Layer (apps/comments) und in jeder Community, deren Owner die Seite
 *    noch nicht angelegt hat. Beides ist derselbe 404 und beides ist normal —
 *    die Seite zeigt dann keinen Text, keinen Fehler. Wer die Seiten verwalten
 *    darf, sieht stattdessen den Hinweis, wo er ihn schreiben kann; für alle
 *    anderen wäre das eine Aufforderung ins Leere.
 *
 * 3. **Team** (`/api/community/members`): fehlt in jeder App ohne
 *    onboarding-Layer (apps/comments → 404) UND für jeden, der die Community
 *    nicht verwaltet (403). Zweiteres ist eine EHRLICHE EINSCHRÄNKUNG und keine
 *    Nachlässigkeit: die bestehende Naht ins Control Plane verlangt
 *    `team.manage` und liefert die E-Mail-Adressen ALLER Mitglieder mit. Eine
 *    öffentliche Team-Liste hieße, diesen Endpunkt für schwächere Rollen zu
 *    öffnen — also zu entscheiden, wer künftig Mitglieder-Adressen lesen darf.
 *    Das ist eine Autorisierungs-Entscheidung, keine Nebenwirkung einer
 *    About-Seite, und sie gehört David. Bis dahin: wer das Team ohnehin
 *    verwaltet, sieht es hier; alle anderen sehen den Abschnitt nicht.
 *
 * ── KEIN PROFIL-LINK ───────────────────────────────────────────────────────
 * Das Konzept nennt „Liste der Admins mit Profil-Link". Eine öffentliche
 * Profilseite gibt es in diesem Produkt nicht — `/dashboard/users/:id` ist die
 * BETREIBER-Nutzerverwaltung (Capability `users.manage`, instanzweit) und wäre
 * für fast jeden Betrachter ein toter Link. Namen und Rolle stehen deshalb ohne
 * Verlinkung da; ein Profil ist ein eigenes Feature mit eigenen Fragen (was
 * steht darauf, wer darf es sehen), kein Anhängsel hier.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const requestFetch = useRequestFetch()

useBrandTitle(() => t('posts.discussions.about.title'), {
  description: () => t('posts.discussions.about.description'),
})

const { data: stats } = await useFetch<DiscussionAboutResponse>('/api/posts/discussions/about')

/**
 * `useRequestFetch` + `.catch(() => null)`: der SSR-interne Aufruf MUSS den
 * Host-Header weiterreichen (im Pool entscheidet er über den Mandanten), und
 * ein 404/403 ist hier ein ERWARTETES Ergebnis, kein Fehler — siehe oben.
 */
const { data: about } = await useAsyncData(
  () => `discussions-about-page-${locale.value}`,
  () => requestFetch<PublicPage>(`/api/pages/public/${DISCUSSIONS_ABOUT_SLUG}`, {
    query: { locale: locale.value },
  }).catch(() => null),
  { watch: [locale] },
)

const { data: team } = await useAsyncData(
  'discussions-about-team',
  () => requestFetch<AboutTeamResponse>('/api/community/members').catch(() => null),
)

/**
 * Owner und Admin stehen zusammen — nach außen ist beides „die Leitung", und
 * die Unterscheidung (wer übertragen und abrechnen darf) geht niemanden etwas
 * an, der hier liest. Nur Mitglieder MIT Zugang: eine entfernte Person ist kein
 * Ansprechpartner mehr.
 */
const admins = computed(() =>
  (team.value?.members ?? []).filter(m => m.status === 'active' && (m.role === 'owner' || m.role === 'admin')),
)
const moderators = computed(() =>
  (team.value?.members ?? []).filter(m => m.status === 'active' && m.role === 'moderator'),
)
const hasTeam = computed(() => admins.value.length > 0 || moderators.value.length > 0)

/** Ohne Namen aus dem Runtime-Projekt bleibt die Adresse — so macht es die
 *  Mitglieder-Verwaltung auch (leere Zeile wäre die schlechtere Antwort). */
function displayName(member: { name: string, email: string }): string {
  return member.name || member.email
}

// Wer den Text schreiben DARF, bekommt den Hinweis — sonst niemand: eine
// Aufforderung an jemanden ohne die Seite dafür ist nur Rauschen.
const canManagePages = useCommunityCapability('pages.manage')

const figures = computed(() => [
  { key: 'topicsTotal', value: stats.value?.topicsTotal ?? 0 },
  { key: 'topicsLast7Days', value: stats.value?.topicsLast7Days ?? 0 },
  { key: 'postsToday', value: stats.value?.postsToday ?? 0 },
  { key: 'categories', value: stats.value?.categories ?? 0 },
])
</script>

<template>
  <UContainer class="max-w-3xl py-8">
    <UButton
      :to="localePath('/discussions')"
      icon="i-ph-arrow-left"
      color="neutral"
      variant="ghost"
      size="xs"
      class="-ms-2 mb-2"
    >
      {{ t('posts.discussions.title') }}
    </UButton>

    <h1 class="text-2xl font-bold">{{ t('posts.discussions.about.title') }}</h1>

    <!-- Der Text des Owners. Fehlt er, steht hier nichts — außer für den, der
         ihn schreiben kann. -->
    <div v-if="about" class="mt-4">
      <MarkdownContent :source="about.body" />
    </div>
    <UAlert
      v-else-if="canManagePages"
      class="mt-4"
      color="neutral"
      variant="subtle"
      icon="i-ph-note-pencil"
      :title="t('posts.discussions.about.noTextTitle')"
      :description="t('posts.discussions.about.noTextHint')"
      :actions="[{
        label: t('posts.discussions.about.noTextAction'),
        to: localePath('/dashboard/pages'),
        color: 'neutral',
        variant: 'outline',
      }]"
    />

    <h2 class="mt-8 text-lg font-semibold">{{ t('posts.discussions.about.figuresTitle') }}</h2>
    <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="figure in figures" :key="figure.key" class="rounded-lg bg-elevated/50 p-4">
        <dt class="text-xs text-muted">{{ t(`posts.discussions.about.figure.${figure.key}`) }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ formatCount(figure.value) }}</dd>
      </div>
    </dl>

    <!-- Nur wenn die Naht etwas geliefert hat — siehe Kopf. -->
    <template v-if="hasTeam">
      <h2 class="mt-8 text-lg font-semibold">{{ t('posts.discussions.about.teamTitle') }}</h2>

      <div v-if="admins.length > 0" class="mt-3">
        <h3 class="text-sm font-medium text-muted">{{ t('posts.discussions.about.admins') }}</h3>
        <ul class="mt-2 flex flex-wrap gap-2">
          <li
            v-for="member in admins"
            :key="member.id"
            class="flex items-center gap-2 rounded-full bg-elevated/50 py-1 pe-3 ps-1"
          >
            <UserAvatar :user="{ name: displayName(member) }" size="xs" />
            <span class="text-sm">{{ displayName(member) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="moderators.length > 0" class="mt-4">
        <h3 class="text-sm font-medium text-muted">{{ t('posts.discussions.about.moderators') }}</h3>
        <ul class="mt-2 flex flex-wrap gap-2">
          <li
            v-for="member in moderators"
            :key="member.id"
            class="flex items-center gap-2 rounded-full bg-elevated/50 py-1 pe-3 ps-1"
          >
            <UserAvatar :user="{ name: displayName(member) }" size="xs" />
            <span class="text-sm">{{ displayName(member) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </UContainer>
</template>
