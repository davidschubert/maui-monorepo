<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { TrustLevelMember, TrustLevelMembersResponse } from '../../../shared/types/post'

/**
 * Vertrauensstufe 4 („Leader") ernennen und entziehen (F1 Teilpaket 3).
 *
 * ── WAS DIESE SEITE ABSICHTLICH NICHT KANN ────────────────────────────────
 * Die Stufen 1–3 vergibt sie nicht. Sie rechnen sich aus Tagen, Inhalten und
 * Stimmen zusammen — ein Knopf daneben wäre die Behauptung, man könne sie auch
 * schenken, und damit wären die Schwellen nur noch ein Vorschlag. Die Seite
 * ZEIGT sie, damit der Owner sieht, wo jemand steht.
 *
 * ── WEN SIE LISTET ────────────────────────────────────────────────────────
 * Wer hier schon einmal etwas getan hat (eine Zähler-Zeile). Nicht die
 * Mitgliederliste — die gehört dem onboarding-Layer, und die Begründung dafür
 * steht ausführlich an der Route. Kurz: eine Vertrauensstufe für jemanden zu
 * vergeben, der in dieser Community noch nie geschrieben hat, wäre eine Aussage
 * ohne Grundlage.
 *
 * UTable als Datenliste (Davids Regel B6), Leerzustand über CoreEmptyState.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'posts.appoint' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
useHead({ title: () => t('posts.trustLevels.title') })

const { data, status, refresh } = await useFetch<TrustLevelMembersResponse>('/api/posts/trust-levels', {
  lazy: true,
  server: false,
})

const leaders = computed(() => data.value?.leaders ?? [])
const members = computed(() => data.value?.members ?? [])
const truncated = computed(() => data.value?.truncated ?? false)

const search = ref('')
/**
 * Gesucht wird über NAME und Id. Die Id ist die unschöne, aber ehrliche
 * Rückfallebene: ist ein Name nicht auflösbar (gelöschtes Konto, fehlender
 * Scope), bleibt sie das Einzige, worüber man diesen Menschen finden kann.
 */
const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return members.value
  return members.value.filter(entry =>
    entry.name.toLowerCase().includes(needle) || entry.userId.toLowerCase().includes(needle))
})

const columns = computed<TableColumn<TrustLevelMember>[]>(() => [
  { id: 'name', header: () => t('posts.trustLevels.col.person') },
  { id: 'level', header: () => t('posts.trustLevels.col.level') },
  { id: 'activity', header: () => t('posts.trustLevels.col.activity') },
  { id: 'actions', header: () => '' },
])

function displayName(entry: TrustLevelMember): string {
  return entry.name || t('posts.trustLevels.unknownPerson')
}

function levelLabel(level: number): string {
  return t(`posts.trustLevels.level.${level}`)
}

const pending = ref<string | null>(null)

async function setLeader(entry: TrustLevelMember, leader: boolean) {
  if (pending.value) return

  // Nur das ENTZIEHEN wird rückgefragt. Ernennen ist ein Zugewinn und mit einem
  // Klick zurücknehmbar; entziehen nimmt jemandem Werkzeuge weg, die er
  // vielleicht gerade benutzt.
  if (!leader) {
    const ok = await confirm({
      title: t('posts.trustLevels.confirmRevokeTitle'),
      description: t('posts.trustLevels.confirmRevokeText', {
        name: displayName(entry),
        level: levelLabel(entry.earnedLevel),
      }),
      confirmLabel: t('posts.trustLevels.revoke'),
      action: () => $fetch(`/api/posts/trust-levels/${entry.userId}`, { method: 'PATCH', body: { leader } }),
    })
    if (!ok) return
    toast.add({ title: t('posts.trustLevels.revoked'), color: 'success' })
    await refresh()
    return
  }

  pending.value = entry.userId
  try {
    await $fetch(`/api/posts/trust-levels/${entry.userId}`, { method: 'PATCH', body: { leader } })
    toast.add({ title: t('posts.trustLevels.appointed', { name: displayName(entry) }), color: 'success' })
    await refresh()
  }
  catch (error) {
    // Der Server hebt fachliche Gründe als `reason` ins Envelope
    // (core/server/error.ts) — beide sind hier erklärbar statt nur „ging nicht".
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    const key = reason === 'self_appoint'
      ? 'posts.trustLevels.selfAppoint'
      : reason === 'no_counters'
        ? 'posts.trustLevels.noCounters'
        : 'posts.trustLevels.saveFailed'
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    pending.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="post-trust-levels">
    <template #header>
      <UDashboardNavbar :title="t('posts.trustLevels.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-6 max-w-3xl text-sm text-muted">{{ t('posts.trustLevels.description') }}</p>

      <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
        <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
      </div>

      <template v-else>
        <!-- Die Ernannten zuerst und vollständig: sie sind die Antwort auf
             „wer hat hier zusätzliche Rechte?" -->
        <section class="mb-8">
          <h2 class="mb-2 text-sm font-semibold tracking-wide text-dimmed uppercase">
            {{ t('posts.trustLevels.leadersTitle') }}
          </h2>
          <p v-if="!leaders.length" class="text-sm text-muted">
            {{ t('posts.trustLevels.noLeaders') }}
          </p>
          <ul v-else class="flex flex-wrap gap-2" data-trust-leaders>
            <li
              v-for="entry in leaders"
              :key="entry.userId"
              class="flex items-center gap-2 rounded-lg border border-default px-3 py-2"
            >
              <UIcon name="i-ph-medal-fill" class="size-4 text-primary" />
              <span class="text-sm font-medium">{{ displayName(entry) }}</span>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-ph-x"
                :aria-label="t('posts.trustLevels.revoke')"
                @click="setLeader(entry, false)"
              />
            </li>
          </ul>
        </section>

        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          :placeholder="t('posts.trustLevels.searchPlaceholder')"
          class="mb-4 max-w-md"
          data-trust-search
        />

        <UTable :data="filtered" :columns="columns" data-trust-table>
          <template #name-cell="{ row }">
            <p class="font-medium text-default">{{ displayName(row.original) }}</p>
            <p class="font-mono text-xs text-dimmed">{{ row.original.userId }}</p>
          </template>

          <template #level-cell="{ row }">
            <UBadge :color="row.original.leader ? 'primary' : 'neutral'" variant="subtle" size="sm">
              {{ levelLabel(row.original.level) }}
            </UBadge>
            <!-- Bei einem Ernannten steht daneben, worauf ein Entzug
                 zurückfällt — sonst wäre „entziehen" ein Sprung ins Ungewisse. -->
            <p v-if="row.original.leader" class="mt-1 text-xs text-dimmed">
              {{ t('posts.trustLevels.earnedBelow', { level: levelLabel(row.original.earnedLevel) }) }}
            </p>
          </template>

          <template #activity-cell="{ row }">
            <p class="text-sm tabular-nums text-muted">
              {{ t('posts.trustLevels.activity', {
                content: row.original.contentCreated,
                given: row.original.upvotesGiven,
                received: row.original.upvotesReceived,
              }) }}
            </p>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                v-if="row.original.leader"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-ph-medal-slash"
                :label="t('posts.trustLevels.revoke')"
                @click="setLeader(row.original, false)"
              />
              <UButton
                v-else
                color="neutral"
                variant="subtle"
                size="xs"
                icon="i-ph-medal"
                :label="t('posts.trustLevels.appoint')"
                :loading="pending === row.original.userId"
                @click="setLeader(row.original, true)"
              />
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              v-if="search.trim()"
              icon="i-ph-funnel"
              :title="t('ui.empty.noResultsTitle')"
              :description="t('ui.empty.noResultsText')"
              :action-label="t('ui.empty.resetFilters')"
              action-icon="i-ph-arrow-counter-clockwise"
              @action="() => { search = '' }"
            />
            <CoreEmptyState
              v-else
              icon="i-ph-medal"
              :title="t('posts.trustLevels.emptyTitle')"
              :description="t('posts.trustLevels.emptyText')"
            />
          </template>
        </UTable>

        <!-- Ehrlich statt beruhigend: wenn nicht alle da sind, muss die Seite
             das sagen — sonst sucht jemand vergeblich nach einer Person. -->
        <p v-if="truncated" class="mt-3 text-xs text-dimmed">
          {{ t('posts.trustLevels.truncated') }}
        </p>
      </template>
    </template>
  </UDashboardPanel>
</template>
