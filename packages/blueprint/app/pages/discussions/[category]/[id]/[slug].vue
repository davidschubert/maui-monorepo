<script setup lang="ts">
import { resolveCanonicalTopicRoute } from '../../../../../../posts/shared/discussionUrl'
import type { DiscussionTopicResponse } from '../../../../../../posts/shared/types/post'

/**
 * BAUPLAN-Komposition: ein Topic (F1 Stufe 1).
 *
 * NICHTS NEUES an der Darstellung — dieselbe `PostCard` wie im Feed, darunter
 * dieselbe `CommentSection` mit `targetType: 'post'` (Muster feed.vue). Ein
 * eigener Renderpfad für Topics wäre der Anfang zweier Beitrags-Darstellungen,
 * die auseinanderlaufen.
 *
 * DIE 301-REGEL: die Route löst AUSSCHLIESSLICH über die Id auf. Kategorie-
 * und Slug-Segment sind Deko; stimmt eines nicht mit dem heutigen Zustand
 * überein, geht es dauerhaft auf die kanonische URL. Die Entscheidung selbst
 * ist eine PURE Funktion mit Gegenproben (posts/shared/discussionUrl.ts) —
 * hier steht nur die Übersetzung in eine HTTP-Antwort.
 *
 * KEIN eigener Canonical-Tag: den setzt `useLocaleSeoHead()` in der `app.vue`
 * als EINZIGEN Aufruf jeder App (CLAUDE.md), und weil nicht-kanonische URLs
 * vorher umleiten, zeigt er immer schon auf die richtige Adresse. Ein zweiter
 * Tag hier wäre eine konkurrierende Wahrheit.
 */
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()

const id = computed(() => String(route.params.id ?? ''))

const { data, error } = await useFetch<DiscussionTopicResponse>(() => `/api/posts/discussions/${id.value}`)
if (error.value || !data.value) {
  throw createError({ status: 404, statusText: 'Topic not found' })
}

const decision = resolveCanonicalTopicRoute({
  requestedCategory: String(route.params.category ?? ''),
  requestedSlug: String(route.params.slug ?? ''),
  canonicalCategory: data.value.category.slug,
  canonicalSlug: data.value.slug,
  id: data.value.post.$id,
})
if (!decision.ok) {
  // `localePath` bleibt dran: die kanonische Fassung einer /de/-URL ist eine
  // /de/-URL. Ohne ihn verlöre jede Umleitung die Sprache.
  await navigateTo(localePath(decision.to), { redirectCode: 301, replace: true })
}

const topic = computed(() => data.value!)

useBrandTitle(
  () => topic.value.post.title || t('posts.discussions.title'),
  { description: () => t('posts.discussions.inCategory', { category: topic.value.category.name }) },
)

const post = ref(topic.value.post)
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <UButton
      :to="localePath(`/discussions/${topic.category.slug}`)"
      icon="i-ph-arrow-left"
      color="neutral"
      variant="ghost"
      size="xs"
      class="-ms-2 mb-3"
      data-topic-back
    >
      {{ t('posts.discussions.backToCategory', { category: topic.category.name }) }}
    </UButton>

    <PostCard :post="post" default-comments-open @updated="p => { post = p }">
      <template #comments="{ post: slotPost }">
        <CommentSection
          :target-id="slotPost.$id"
          target-type="post"
          :target-url="topic.path"
        />
      </template>
    </PostCard>
  </UContainer>
</template>
