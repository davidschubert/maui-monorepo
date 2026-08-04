<script setup lang="ts">
import {
  TOPIC_SOLUTION_FILTERS,
  TOPIC_STATE_FILTERS,
  activeTopicFilterCount,
  type TopicFilters,
} from '../../shared/discussionFilters'
import type { CategoryListResponse } from '../../shared/types/post'

/**
 * Der aufklappbare Filter-Bereich über der Themen-Liste (F1 Stufe 3,
 * Konzept § 3.3).
 *
 * ZUGEKLAPPT VOREINGESTELLT — mit EINER Ausnahme: sind schon Filter gesetzt
 * (geteilter Link, Zurück-Navigation), steht er offen. Ein Mensch, der eine
 * gefilterte Liste öffnet, muss sehen können, WARUM sie kurz ist; ein
 * zugeklappter Bereich mit einer stillen Wirkung ist die häufigste Ursache für
 * „die Suche ist kaputt".
 *
 * Der Knopf trägt die ZAHL der gesetzten Filter (`activeTopicFilterCount`,
 * pur und getestet) — dieselbe Regel, die entscheidet, was hier hineingehört.
 *
 * WAS HIER NICHT STEHT: sechs Kästchen aus Davids Katalog. Sie fehlen nicht aus
 * Zeitmangel — jedes wäre entweder wirkungslos, gegenstandslos oder unehrlich.
 * Die vollständige Abrechnung steht im Kopf von shared/discussionFilters.ts;
 * sie hier zu wiederholen hieße, sie beim nächsten Mal an einer der beiden
 * Stellen zu vergessen.
 */
const filters = defineModel<TopicFilters>({ required: true })

const props = defineProps<{
  /** Auf einer Kategorie-SEITE steht die Kategorie fest — dann kein Auswahlkasten. */
  categoryFixed?: boolean
  /** Anzeigename des gefilterten Autors, falls bekannt (siehe unten). */
  authorName?: string
}>()

const { t } = useI18n()
const { isLoggedIn, user } = useCurrentUser()

const open = ref(activeTopicFilterCount(filters.value) > 0)
const activeCount = computed(() => activeTopicFilterCount(filters.value))

/**
 * Die Kategorien werden NUR geladen, wenn der Auswahlkasten auch erscheint.
 * `?all=1`, damit ein Filter auf eine stillgelegte Kategorie aus einem alten
 * Link nicht ins Leere zeigt (ihre Bestands-Themen sind weiter sichtbar).
 */
const { data: categoryData } = props.categoryFixed
  ? { data: ref<CategoryListResponse | null>(null) }
  : await useFetch<CategoryListResponse>('/api/posts/categories', { query: { all: '1' } })

const categoryItems = computed(() => [
  { value: '', label: t('posts.discussions.filters.allCategories') },
  ...(categoryData.value?.rows ?? []).map(row => ({ value: row.category.slug, label: row.category.name })),
])

const stateItems = computed(() => TOPIC_STATE_FILTERS.map(value => ({
  value,
  label: t(`posts.discussions.filters.state.${value}`),
})))
const solutionItems = computed(() => TOPIC_SOLUTION_FILTERS.map(value => ({
  value,
  label: t(`posts.discussions.filters.solution.${value}`),
})))

/**
 * „Nur meine Themen" ist eine Abkürzung auf den Autor-Filter, kein zweites
 * Feld: sonst gäbe es zwei Wege, dasselbe zu sagen, und die Frage, was gilt,
 * wenn beide gesetzt sind.
 */
const mineOnly = computed({
  get: () => !!user.value?.$id && filters.value.author === user.value.$id,
  set: (value: boolean) => {
    filters.value = { ...filters.value, author: value ? (user.value?.$id ?? '') : '' }
  },
})

/**
 * Der Autor-Filter wird durch einen KLICK auf einen Namen in der Liste gesetzt,
 * nicht getippt. Grund: es gibt keine öffentliche Nutzer-Suche, und eine über
 * den Anzeigenamen wäre falsch (Namen sind nicht eindeutig). Hier steht
 * deshalb nur ein abnehmbares Schild — der Name kommt aus der Liste, aus der
 * geklickt wurde. Ist er unbekannt (frisch geteilter Link, noch keine Zeile
 * geladen), steht dort das allgemeine Wort statt eines geratenen Namens.
 */
const authorLabel = computed(() => props.authorName || t('posts.discussions.filters.someAuthor'))

function reset() {
  filters.value = {
    ...filters.value,
    createdAfter: null,
    createdBefore: null,
    author: '',
    pinnedOnly: false,
    state: 'any',
    solution: 'any',
  }
}

/**
 * Die Datumsfelder halten `YYYY-MM-DD`, der Filter einen ISO-Zeitpunkt. Die
 * Umrechnung steht hier und nicht in der puren Regel: dort ist ein Datum eine
 * GRENZE, hier ist es eine Eingabe. Ein leeres Feld heißt „keine Grenze".
 */
function dayValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}
function setDay(key: 'createdAfter' | 'createdBefore', value: string) {
  filters.value = {
    ...filters.value,
    [key]: /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : null,
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        :icon="open ? 'i-ph-caret-up' : 'i-ph-sliders-horizontal'"
        color="neutral"
        variant="subtle"
        size="sm"
        data-discussions-filters-toggle
        @click="open = !open"
      >
        {{ t('posts.discussions.filters.title') }}
        <UBadge v-if="activeCount > 0" color="primary" variant="solid" size="sm">{{ activeCount }}</UBadge>
      </UButton>

      <!-- Das Autor-Schild steht AUSSERHALB des Aufklapp-Bereichs: es entsteht
           durch einen Klick in der Liste, also muss man es auch ohne Aufklappen
           wieder loswerden. -->
      <UBadge
        v-if="filters.author"
        color="neutral"
        variant="subtle"
        size="sm"
        class="gap-1"
        data-discussions-filter-author
      >
        {{ t('posts.discussions.filters.byAuthor', { name: authorLabel }) }}
        <UButton
          icon="i-ph-x"
          color="neutral"
          variant="link"
          size="xs"
          :padded="false"
          :aria-label="t('posts.discussions.filters.clearAuthor')"
          @click="filters = { ...filters, author: '' }"
        />
      </UBadge>
    </div>

    <div
      v-if="open"
      class="grid gap-3 rounded-lg bg-elevated/40 p-3 ring ring-default sm:grid-cols-2 lg:grid-cols-3"
      data-discussions-filters
    >
      <UFormField v-if="!props.categoryFixed" :label="t('posts.discussions.filters.category')">
        <USelect
          :model-value="filters.category"
          :items="categoryItems"
          size="sm"
          class="w-full"
          @update:model-value="value => filters = { ...filters, category: String(value) }"
        />
      </UFormField>

      <UFormField :label="t('posts.discussions.filters.after')">
        <UInput
          type="date"
          :model-value="dayValue(filters.createdAfter)"
          size="sm"
          class="w-full"
          @update:model-value="value => setDay('createdAfter', String(value))"
        />
      </UFormField>

      <UFormField :label="t('posts.discussions.filters.before')">
        <UInput
          type="date"
          :model-value="dayValue(filters.createdBefore)"
          size="sm"
          class="w-full"
          @update:model-value="value => setDay('createdBefore', String(value))"
        />
      </UFormField>

      <UFormField :label="t('posts.discussions.filters.stateLabel')">
        <USelect
          :model-value="filters.state"
          :items="stateItems"
          size="sm"
          class="w-full"
          @update:model-value="value => filters = { ...filters, state: value as TopicFilters['state'] }"
        />
      </UFormField>

      <UFormField :label="t('posts.discussions.filters.solutionLabel')">
        <USelect
          :model-value="filters.solution"
          :items="solutionItems"
          size="sm"
          class="w-full"
          @update:model-value="value => filters = { ...filters, solution: value as TopicFilters['solution'] }"
        />
      </UFormField>

      <div class="flex flex-col justify-end gap-2">
        <UCheckbox
          :model-value="filters.pinnedOnly"
          :label="t('posts.discussions.filters.pinnedOnly')"
          @update:model-value="value => filters = { ...filters, pinnedOnly: value === true }"
        />
        <UCheckbox
          v-if="isLoggedIn"
          v-model="mineOnly"
          :label="t('posts.discussions.filters.mineOnly')"
        />
      </div>

      <div class="sm:col-span-2 lg:col-span-3">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-ph-arrow-counter-clockwise"
          :disabled="activeCount === 0"
          @click="reset"
        >
          {{ t('posts.discussions.filters.reset') }}
        </UButton>
      </div>
    </div>
  </div>
</template>
