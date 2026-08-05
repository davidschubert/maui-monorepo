<script setup lang="ts">
import { BADGE_CATALOG, BADGE_GROUPS, type BadgeGroup, type BadgeProgress, badgeProgress } from '../../shared/badges'
import type { TrustLevelProgressEntry } from '../../shared/trustLevels'
import type { DiscussionBadge, DiscussionBadgesResponse } from '../../shared/types/post'

/**
 * Die Abzeichen-Galerie (F1 Stufe 4).
 *
 * KEINE `UTable`, und das ist die Ausnahme mit Begründung: Davids Regel B6
 * gilt DATENLISTEN IM DASHBOARD — Sortieren, Auswählen, Blättern. Hier gibt es
 * nichts davon. Der Katalog ist eine feste, kurze Liste, die man ÜBERBLICKT
 * statt sie zu durchsuchen; ihre Aussage steckt im Vergleich („was habe ich,
 * was fehlt noch"), und dafür ist ein Raster die richtige Form.
 *
 * DER GANZE KATALOG STEHT DA, auch das Unerreichte — sonst zeigte die Seite
 * nur, was man schon weiß. Unverdientes ist gedämpft und trägt seine
 * Bedingung; verdientes trägt das Verleihdatum.
 *
 * DER FORTSCHRITT KOMMT AUS DER PUREN REGEL (`badgeProgress`) und erscheint
 * nur, wo er nicht lügt — die Begründung steht dort.
 */
const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()

const { data, status } = await useFetch<DiscussionBadgesResponse>('/api/posts/discussions/badges')

const facts = computed(() => data.value?.facts ?? null)
const rows = computed(() => data.value?.rows ?? [])
const earnedCount = computed(() => rows.value.filter(row => row.earned).length)

function badgesOf(group: BadgeGroup): DiscussionBadge[] {
  return rows.value.filter(row => row.group === group)
}

/** Der Katalog-Eintrag zum Schlüssel — für Bedingung und Fortschritt. */
function definitionOf(key: string) {
  return BADGE_CATALOG.find(entry => entry.key === key)
}

function progressOf(key: string): BadgeProgress | null {
  const definition = definitionOf(key)
  const measured = facts.value
  if (!definition || !measured) return null
  return badgeProgress(definition, measured)
}

/** Getrennt vom Fortschritt selbst, weil `t()` ein reines Werte-Objekt will. */
function progressValues(progress: BadgeProgress): Record<string, number> {
  return { current: progress.current, target: progress.target }
}

/* ─── Die Vertrauensstufe (F1 Teilpaket 3) ────────────────────────────────── */

/**
 * DIE STUFE STEHT HIER UND NICHT NEBEN DEN AUTORENNAMEN. Davids Entscheidung 8
 * gilt für sie wie für jedes Abzeichen: neben 25 Autoren einer Themenliste wäre
 * sie ein N+1 oder eine denormalisierte Spalte mit eigenen Schreibwegen. In der
 * eigenen Galerie kostet sie nichts — die Antwort liegt ohnehin vor.
 *
 * GEZEIGT WIRD JEDE BEDINGUNG EINZELN, auch die erfüllten. Ein Balken müsste
 * sich für eine der vier entscheiden und läse sich wie „fast geschafft",
 * während drei andere Zahlen weit weg sind. Die Liste ist die ehrliche Form —
 * dieselbe Überlegung, aus der `badgeProgress` bei mehreren Bedingungen lieber
 * gar nichts sagt.
 */
const trustLevel = computed(() => data.value?.trustLevel ?? 0)
const trustProgress = computed(() => data.value?.trustProgress ?? null)

/** Getrennt, weil `t()` ein reines Werte-Objekt will (wie oben). */
function trustValues(entry: TrustLevelProgressEntry): Record<string, number> {
  return { missing: entry.missing, current: entry.current ?? 0, target: entry.target }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold">{{ t('posts.discussions.badges.title') }}</h1>
      <p class="mt-1 text-sm text-muted">{{ t('posts.discussions.badges.description') }}</p>
      <p v-if="facts" class="mt-2 text-sm text-muted">
        {{ t('posts.discussions.badges.earnedSummary', { earned: earnedCount, total: rows.length }) }}
      </p>
      <p v-else-if="status !== 'pending'" class="mt-2 text-sm text-muted">
        {{ t('posts.discussions.badges.guestHint') }}
      </p>
    </div>

    <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <div v-else class="space-y-8">
      <section v-for="group in BADGE_GROUPS" :key="group" class="space-y-3">
        <h2 class="text-sm font-semibold tracking-wide text-dimmed uppercase">
          {{ t(`posts.discussions.badges.group.${group}`) }}
        </h2>

        <!-- Die Stufen-Gruppe bekommt einen Kopf: WO STEHE ICH, und was fehlt
             zur nächsten. Die vier Kacheln darunter bleiben, was sie sind —
             Abzeichen; der Kopf sagt den heutigen Zustand. -->
        <div v-if="group === 'trustLevel'" class="rounded-lg border border-default p-4" data-trust-level>
          <p class="font-medium">
            {{ t('posts.discussions.trust.current', { level: t(`posts.trustLevels.level.${trustLevel}`) }) }}
          </p>

          <template v-if="trustProgress">
            <p class="mt-2 text-sm text-muted">
              {{ t('posts.discussions.trust.next', { level: t(`posts.trustLevels.level.${trustProgress.level}`) }) }}
            </p>
            <ul class="mt-2 space-y-1">
              <li
                v-for="entry in trustProgress.entries"
                :key="entry.condition"
                class="flex items-start gap-2 text-sm"
                :class="entry.met ? 'text-muted' : 'text-default'"
              >
                <UIcon
                  :name="entry.met ? 'i-ph-check-circle-fill' : 'i-ph-circle-dashed'"
                  class="mt-0.5 size-4 shrink-0"
                  :class="entry.met ? 'text-primary' : 'text-dimmed'"
                />
                <span class="tabular-nums">
                  {{ entry.met
                    ? t(`posts.discussions.trust.done.${entry.condition}`, trustValues(entry))
                    : t(`posts.discussions.trust.missing.${entry.condition}`, trustValues(entry)) }}
                </span>
              </li>
            </ul>
          </template>
          <p v-else-if="facts" class="mt-2 text-sm text-muted">
            {{ t('posts.discussions.trust.topLevel') }}
          </p>
          <p v-else class="mt-2 text-sm text-muted">
            {{ t('posts.discussions.trust.guestHint') }}
          </p>
        </div>

        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-discussion-badges>
          <li
            v-for="entry in badgesOf(group)"
            :key="entry.key"
            class="rounded-lg border border-default p-3"
            :class="entry.earned ? 'bg-elevated/40' : ''"
          >
            <div class="flex items-start gap-2">
              <UIcon
                :name="entry.earned ? 'i-ph-seal-check-fill' : 'i-ph-seal'"
                class="mt-0.5 size-5 shrink-0"
                :class="entry.earned ? 'text-primary' : 'text-dimmed'"
              />
              <div class="min-w-0">
                <p class="font-medium" :class="entry.earned ? 'text-default' : 'text-muted'">
                  {{ t(`posts.discussions.badges.name.${entry.key}`) }}
                  <!-- Mehrfach verliehen: die ANZAHL statt mehrerer Kacheln —
                       eine Reihe gleicher Namen wäre eine Wand, keine Aussage. -->
                  <span v-if="entry.count > 1" class="ml-1 text-sm tabular-nums text-muted">
                    {{ t('posts.discussions.badges.times', { count: entry.count }) }}
                  </span>
                </p>
                <p class="text-sm text-muted">
                  {{ t(`posts.discussions.badges.criterion.${entry.key}`) }}
                </p>
                <p v-if="entry.earned && entry.awardedAt" class="mt-1 text-xs text-dimmed">
                  {{ t('posts.discussions.badges.awarded', { when: formatRelativeTime(entry.awardedAt) }) }}
                </p>
                <template v-else-if="progressOf(entry.key)">
                  <p class="mt-1 text-xs tabular-nums text-dimmed">
                    {{ t('posts.discussions.badges.progress', progressValues(progressOf(entry.key)!)) }}
                  </p>
                </template>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
