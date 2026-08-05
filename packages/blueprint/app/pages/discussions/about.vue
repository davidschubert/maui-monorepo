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
  runtimeUserId: string
  name: string
  role: string
  avatarUrl: string
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
 * 3. **Team** (`/api/community/team`): fehlt weiterhin in jeder App ohne
 *    onboarding-Layer (apps/comments → 404) — dort entfällt der Abschnitt
 *    lautlos. Für ANGEMELDETE wie für GÄSTE ist er seit Stufe 3 aber da
 *    (Davids Entscheidung 2026-08-04).
 *
 *    Bis dahin hing er an `team.manage`, und das war eine ehrliche
 *    Einschränkung: die Mitglieder-Naht liefert die E-Mail-Adressen ALLER
 *    Mitglieder mit, sie für schwächere Rollen zu öffnen wäre eine
 *    Autorisierungs-Entscheidung gewesen. Gelöst ist das jetzt NICHT dadurch,
 *    dass jene Naht aufgeweicht wurde, sondern durch eine zweite, die weniger
 *    KANN: nur Leitung und Moderation, nur Name und Bild, keine Adresse (pure
 *    Regel `publicTeamFrom` im Control Plane). In einer geschlossenen
 *    Community (C18) bleibt sie für Gäste zu.
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
  () => requestFetch<AboutTeamResponse>('/api/community/team').catch(() => null),
)

/**
 * Owner und Admin stehen zusammen — nach außen ist beides „die Leitung", und
 * die Unterscheidung (wer übertragen und abrechnen darf) geht niemanden etwas
 * an, der hier liest.
 *
 * NICHT MEHR NACH `status` GEFILTERT: das erledigt seit Stufe 3 die pure Regel
 * im Control Plane (`publicTeamFrom` lässt nur Mitglieder MIT Zugang durch).
 * Die Prüfung hier ein zweites Mal zu machen, hieße, sich auf ein Feld zu
 * verlassen, das diese Antwort bewusst gar nicht mehr trägt.
 */
const admins = computed(() =>
  (team.value?.members ?? []).filter(m => m.role === 'owner' || m.role === 'admin'),
)
const moderators = computed(() =>
  (team.value?.members ?? []).filter(m => m.role === 'moderator'),
)
const hasTeam = computed(() => admins.value.length > 0 || moderators.value.length > 0)

// Wer den Text schreiben DARF, bekommt den Hinweis — sonst niemand: eine
// Aufforderung an jemanden ohne die Seite dafür ist nur Rauschen.
const canManagePages = useCommunityCapability('pages.manage')

/**
 * Die fünfte Kachel steht nur da, wenn die Zahl wirklich existiert.
 *
 * „Beitritte (7 Tage)" kommt aus dem Control Plane und FEHLT in jeder App ohne
 * die Naht dorthin (apps/comments) sowie bei einem Lesefehler — dieselbe
 * Abstufung wie beim Team-Abschnitt darunter. Ein `?? 0` wäre hier keine
 * Vorsichtsmaßnahme, sondern eine erfundene Tatsache: „diese Woche kam niemand
 * dazu" ist etwas anderes als „wir wissen es nicht".
 */
const figures = computed(() => {
  const rows = [
    { key: 'topicsTotal', value: stats.value?.topicsTotal ?? 0 },
    { key: 'topicsLast7Days', value: stats.value?.topicsLast7Days ?? 0 },
    { key: 'postsToday', value: stats.value?.postsToday ?? 0 },
    { key: 'categories', value: stats.value?.categories ?? 0 },
  ]
  const signups = stats.value?.signupsLast7Days
  if (typeof signups === 'number') rows.push({ key: 'signupsLast7Days', value: signups })
  return rows
})
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
    <!-- Vier ODER fünf Kacheln: die Spaltenzahl folgt der Anzahl, damit die
         letzte nicht als einzelne Waise in einer zweiten Reihe steht. -->
    <dl
      class="mt-3 grid grid-cols-2 gap-3"
      :class="figures.length > 4 ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4'"
    >
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
            :key="member.runtimeUserId"
            class="flex items-center gap-2 rounded-full bg-elevated/50 py-1 pe-3 ps-1"
          >
            <UserAvatar :user="{ name: member.name, prefs: { avatarUrl: member.avatarUrl } }" size="xs" />
            <span class="text-sm">{{ member.name }}</span>
          </li>
        </ul>
      </div>

      <div v-if="moderators.length > 0" class="mt-4">
        <h3 class="text-sm font-medium text-muted">{{ t('posts.discussions.about.moderators') }}</h3>
        <ul class="mt-2 flex flex-wrap gap-2">
          <li
            v-for="member in moderators"
            :key="member.runtimeUserId"
            class="flex items-center gap-2 rounded-full bg-elevated/50 py-1 pe-3 ps-1"
          >
            <UserAvatar :user="{ name: member.name, prefs: { avatarUrl: member.avatarUrl } }" size="xs" />
            <span class="text-sm">{{ member.name }}</span>
          </li>
        </ul>
      </div>
    </template>
  </UContainer>
</template>
