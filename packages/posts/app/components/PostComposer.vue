<script setup lang="ts">
import { MAX_POLL_OPTIONS, type CategoryListResponse, type FeedPost, type PostType } from '../../shared/types/post'

/**
 * Composer für Beitrag/Umfrage/Frage — inkl. optionalem Planen-Termin
 * (scheduledAt → Warteschlange statt Sofort-Publish, Plan P4) und seit F1 der
 * optionalen Kategorie (Discussions).
 *
 * ZWEI EINSTIEGE, EIN COMPOSER (2026-08-04, Davids Regel „Feed und Discussions
 * sind unabhängige Produkte"): derselbe Composer hängt im Feed und hinter dem
 * Knopf „Thema eröffnen" der Discussions-Seiten (DiscussionNewTopic).
 * Geteilt wird der MECHANISMUS — ein Schreibweg, ein Datenmodell, eine
 * Rechteprüfung —, nicht der Einstieg. Ein zweiter Schreibweg für dasselbe
 * wäre die nächste Stelle, an der zwei fast gleiche Dinge auseinanderdriften.
 *
 * `mode` ist der EINZIGE Unterschied, und er ist keine Optik-Variante: unter
 * Discussions ist die Kategorie PFLICHT, weil ein Beitrag ohne Kategorie dort
 * gar nicht erscheint (siehe discussions/index.get.ts). Ein Formular, das etwas
 * abschicken lässt, was danach unauffindbar ist, wäre die schlechtere Antwort
 * als ein deaktivierter Knopf.
 */
const props = withDefaults(defineProps<{
  /** 'feed' = Kategorie optional · 'topic' = Kategorie Pflicht (Discussions). */
  mode?: 'feed' | 'topic'
  /** Vorbelegte Kategorie (Row-Id) — kommt aus der Kategorie-Ansicht. */
  presetCategoryId?: string
}>(), { mode: 'feed', presetCategoryId: '' })

const emit = defineEmits<{ created: [post: FeedPost, scheduled: boolean] }>()

const { t } = useI18n()
const toast = useToast()

const type = ref<PostType>('post')
const title = ref('')
const body = ref('')
const options = ref<string[]>(['', ''])
const pollEndsAt = ref('')
const scheduledAt = ref('')
const showSchedule = ref(false)
const busy = ref(false)

/**
 * Kategorien (F1). Nachgeladen statt SSR: der Composer sieht nur, wer
 * eingeloggt ist, und die Auswahl ist für den ersten Bildhalt entbehrlich.
 *
 * REKA-FALLE: ein `USelectItem` darf keinen Wert `''` tragen. Deshalb ein
 * ausdrücklicher Platzhalter-Schlüssel statt des leeren Strings — er wird
 * beim Absenden wieder zu „keine Kategorie" (der Server kennt nur '' und
 * eine Row-Id). Ein 8-Zeichen-Sentinel kann mit keiner Appwrite-Row-Id
 * kollidieren, die sind 20 Zeichen lang.
 */
const NO_CATEGORY = '__none__'
const categoryId = ref(props.presetCategoryId || NO_CATEGORY)
// Die Kategorie-Ansicht wechselt, während der Composer schon existiert (er
// hängt in einem Modal, das beim Schließen NICHT ausgehängt wird — Reka-Falle).
// Ohne diesen Wächter stünde beim nächsten Öffnen die Kategorie von vorhin.
watch(() => props.presetCategoryId, (value) => {
  categoryId.value = value || NO_CATEGORY
})
// BEWUSST OHNE `await`: der Composer soll kein async-setup bekommen. Er hängt
// im Feed hinter einem `v-if="isLoggedIn"`, und eine Komponente, die nach der
// Hydration erst noch suspendieren muss, erscheint sichtbar verzögert.
const { data: categoryData } = useFetch<CategoryListResponse>('/api/posts/categories', {
  lazy: true,
  server: false,
})
const categoryItems = computed(() => [
  // Unter Discussions gibt es „keine Kategorie" nicht — siehe Kopf.
  ...(props.mode === 'topic' ? [] : [{ value: NO_CATEGORY, label: t('posts.composer.categoryNone') }]),
  ...(categoryData.value?.rows ?? []).map(entry => ({
    value: entry.category.$id,
    label: entry.category.name,
  })),
])
// Ohne angelegte Kategorien gibt es nichts zu wählen — dann bleibt der
// Composer so schlicht, wie er vor F1 war.
const hasCategories = computed(() => (categoryData.value?.rows.length ?? 0) > 0)
/** Fehlt im Topic-Modus die Kategorie, bleibt der Knopf zu (Begründung im Kopf). */
const categoryMissing = computed(() => props.mode === 'topic' && categoryId.value === NO_CATEGORY)

/**
 * Der Platzhalter-Schlüssel darf im Topic-Modus nicht ins Feld durchschlagen:
 * dort steht er in KEINEM Eintrag der Liste, und ein `USelect` zeigt einen
 * unbekannten Wert roh an — im Feld stand wörtlich `__none__` (live gesehen).
 * Nach außen wird er deshalb zu `undefined`, und der Platzhalter greift.
 */
const categorySelection = computed<string | undefined>({
  get: () => (categoryMissing.value ? undefined : categoryId.value),
  set: (value) => { categoryId.value = value ?? NO_CATEGORY },
})

const typeItems = computed(() => ([
  { value: 'post' as const, label: t('posts.composer.typePost'), icon: 'i-ph-note-pencil' },
  { value: 'poll' as const, label: t('posts.composer.typePoll'), icon: 'i-ph-chart-bar-horizontal' },
  { value: 'question' as const, label: t('posts.composer.typeQuestion'), icon: 'i-ph-question' },
]))

const bodyPlaceholder = computed(() => t(`posts.composer.placeholder.${type.value}`))

function addOption() {
  if (options.value.length < MAX_POLL_OPTIONS) options.value.push('')
}
function removeOption(index: number) {
  if (options.value.length > 2) options.value.splice(index, 1)
}

/** datetime-local (lokale Zeit) → ISO mit Offset für das Zod-Schema */
function toIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined
}

async function submit() {
  if (busy.value || !body.value.trim() || categoryMissing.value) return
  busy.value = true
  try {
    const payload: Record<string, unknown> = {
      type: type.value,
      title: title.value.trim() || undefined,
      body: body.value.trim(),
      scheduledAt: showSchedule.value ? toIso(scheduledAt.value) : undefined,
      categoryId: categoryId.value === NO_CATEGORY ? undefined : categoryId.value,
    }
    if (type.value === 'poll') {
      payload.pollOptions = options.value.map(o => o.trim()).filter(o => o.length > 0)
      payload.pollEndsAt = toIso(pollEndsAt.value)
    }
    const row = await $fetch<FeedPost>('/api/posts', { method: 'POST', body: payload })
    const scheduled = row.status === 'scheduled'
    // Nur der GEPLANTE Beitrag braucht eine Erklärung: er erscheint nicht im
    // Feed, der veröffentlichte steht direkt darunter und erklärt sich selbst.
    toast.add({
      title: scheduled
        ? t('posts.composer.scheduledToast')
        : t(props.mode === 'topic' ? 'posts.composer.topicToast' : 'posts.composer.publishedToast'),
      description: scheduled ? t('posts.composer.scheduledHint') : undefined,
      color: 'success',
    })
    // Auch der geplante Beitrag zählt als „veröffentlicht": die Handlung ist
    // das Schreiben, nicht der Zeitpunkt des Erscheinens.
    trackAnalyticsEvent('postCreated')
    emit('created', row, scheduled)
    title.value = ''
    body.value = ''
    options.value = ['', '']
    pollEndsAt.value = ''
    scheduledAt.value = ''
    showSchedule.value = false
    // Zurück auf die VORBELEGUNG, nicht auf „keine": wer aus einer Kategorie
    // heraus eröffnet, eröffnet das nächste Thema mit hoher Wahrscheinlichkeit
    // wieder dort.
    categoryId.value = props.presetCategoryId || NO_CATEGORY
  }
  catch {
    toast.add({ title: t('posts.composer.failed'), description: t('posts.composer.failedHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <!-- Bewusst vom Feed abgesetzt: Primärton + kräftigerer Ring — der
       Composer ist die Bühne, die Karten darunter der Strom. Im Modal
       (Discussions) fällt genau das weg: dort ist er nicht die Bühne AUF einer
       Seite, sondern der ganze Inhalt eines Fensters — ein zweiter Rahmen im
       Rahmen wäre nur Kastenwerk. -->
  <UCard
    data-post-composer
    :ui="props.mode === 'topic'
      ? { root: 'bg-transparent ring-0 shadow-none', body: 'p-0 sm:p-0' }
      : { root: 'bg-primary/5 ring-2 ring-primary/20' }"
  >
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <UTabs
          v-model="type"
          :items="typeItems"
          :content="false"
          size="sm"
          data-composer-type
        />
        <UButton
          :icon="showSchedule ? 'i-ph-clock-clockwise' : 'i-ph-clock'"
          :color="showSchedule ? 'primary' : 'neutral'"
          variant="ghost"
          size="sm"
          data-composer-schedule-toggle
          @click="() => { showSchedule = !showSchedule }"
        >
          {{ t('posts.composer.schedule') }}
        </UButton>
      </div>

      <UInput
        v-if="type === 'post'"
        v-model="title"
        :placeholder="t('posts.composer.titlePlaceholder')"
        size="lg"
        class="w-full"
        data-composer-title
      />

      <PostBodyField
        v-model="body"
        :placeholder="bodyPlaceholder"
        data-composer-body
      />

      <div v-if="type === 'poll'" class="space-y-2" data-composer-options>
        <div v-for="(_, index) in options" :key="index" class="flex items-center gap-2">
          <UInput
            v-model="options[index]"
            :placeholder="t('posts.composer.optionPlaceholder', { n: index + 1 })"
            class="flex-1"
          />
          <UButton
            v-if="options.length > 2"
            icon="i-ph-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('posts.composer.removeOption')"
            @click="removeOption(index)"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            v-if="options.length < MAX_POLL_OPTIONS"
            icon="i-ph-plus"
            color="neutral"
            variant="subtle"
            size="xs"
            @click="addOption"
          >
            {{ t('posts.composer.addOption') }}
          </UButton>
          <div class="flex items-center gap-2 text-sm text-muted">
            <span>{{ t('posts.composer.pollEnd') }}</span>
            <UInput v-model="pollEndsAt" type="datetime-local" size="xs" />
          </div>
        </div>
      </div>

      <div v-if="hasCategories" class="flex flex-wrap items-center gap-2 text-sm text-muted" data-composer-category>
        <span>{{ t('posts.composer.category') }}</span>
        <USelect
          v-model="categorySelection"
          :items="categoryItems"
          :placeholder="t('posts.composer.categoryChoose')"
          size="xs"
          class="min-w-40"
        />
        <span class="text-xs text-dimmed">
          {{ props.mode === 'topic' ? t('posts.composer.categoryTopicHint') : t('posts.composer.categoryHint') }}
        </span>
      </div>

      <div v-if="showSchedule" class="flex items-center gap-2 text-sm text-muted" data-composer-schedule>
        <UIcon name="i-ph-clock" class="size-4" />
        <span>{{ t('posts.composer.scheduleAt') }}</span>
        <UInput v-model="scheduledAt" type="datetime-local" size="xs" />
      </div>

      <div class="flex justify-end">
        <UButton
          :loading="busy"
          :disabled="!body.trim() || categoryMissing"
          data-composer-submit
          @click="submit"
        >
          {{ showSchedule && scheduledAt
            ? t('posts.composer.submitScheduled')
            : t(props.mode === 'topic' ? 'posts.composer.submitTopic' : 'posts.composer.submit') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>
