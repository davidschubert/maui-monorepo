<script setup lang="ts">
import { MAX_POLL_OPTIONS, type CategoryListResponse, type FeedPost, type PostType } from '../../shared/types/post'

/**
 * Composer für Beitrag/Umfrage/Frage — inkl. optionalem Planen-Termin
 * (scheduledAt → Warteschlange statt Sofort-Publish, Plan P4) und seit F1 der
 * optionalen Kategorie (Discussions).
 */
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
const categoryId = ref(NO_CATEGORY)
// BEWUSST OHNE `await`: der Composer soll kein async-setup bekommen. Er hängt
// im Feed hinter einem `v-if="isLoggedIn"`, und eine Komponente, die nach der
// Hydration erst noch suspendieren muss, erscheint sichtbar verzögert.
const { data: categoryData } = useFetch<CategoryListResponse>('/api/posts/categories', {
  lazy: true,
  server: false,
})
const categoryItems = computed(() => [
  { value: NO_CATEGORY, label: t('posts.composer.categoryNone') },
  ...(categoryData.value?.rows ?? []).map(entry => ({
    value: entry.category.$id,
    label: entry.category.name,
  })),
])
// Ohne angelegte Kategorien gibt es nichts zu wählen — dann bleibt der
// Composer so schlicht, wie er vor F1 war.
const hasCategories = computed(() => (categoryData.value?.rows.length ?? 0) > 0)

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
  if (busy.value || !body.value.trim()) return
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
      title: scheduled ? t('posts.composer.scheduledToast') : t('posts.composer.publishedToast'),
      description: scheduled ? t('posts.composer.scheduledHint') : undefined,
      color: 'success',
    })
    emit('created', row, scheduled)
    title.value = ''
    body.value = ''
    options.value = ['', '']
    pollEndsAt.value = ''
    scheduledAt.value = ''
    showSchedule.value = false
    categoryId.value = NO_CATEGORY
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
       Composer ist die Bühne, die Karten darunter der Strom -->
  <UCard data-post-composer :ui="{ root: 'bg-primary/5 ring-2 ring-primary/20' }">
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

      <UTextarea
        v-model="body"
        :placeholder="bodyPlaceholder"
        :rows="3"
        autoresize
        class="w-full"
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
        <USelect v-model="categoryId" :items="categoryItems" size="xs" class="min-w-40" />
        <span class="text-xs text-dimmed">{{ t('posts.composer.categoryHint') }}</span>
      </div>

      <div v-if="showSchedule" class="flex items-center gap-2 text-sm text-muted" data-composer-schedule>
        <UIcon name="i-ph-clock" class="size-4" />
        <span>{{ t('posts.composer.scheduleAt') }}</span>
        <UInput v-model="scheduledAt" type="datetime-local" size="xs" />
      </div>

      <div class="flex justify-end">
        <UButton :loading="busy" :disabled="!body.trim()" data-composer-submit @click="submit">
          {{ showSchedule && scheduledAt ? t('posts.composer.submitScheduled') : t('posts.composer.submit') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>
