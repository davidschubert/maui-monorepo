<script setup lang="ts">
/**
 * Interne Projekt-Doku im Betreiber-Bereich (/docs).
 *
 * Rendert `docs/content/**` — dieselben Dateien, die die eigenständige
 * Docs-App auf Port 4000 zeigt (Collection `internalDocs`, content.config.ts).
 * Bewusst schlicht: Navigation links, Inhalt rechts, control-Dashboard drumherum.
 *
 * Auth: `middleware: ['auth', 'admin']` = dieselbe Kette wie /dashboard (UX).
 * Die AUTORITÄT ist server/middleware/docs-guard.ts — der schützt zusätzlich
 * die Content-API `/__nuxt_content/**`, über die der Browser die Doku sonst
 * komplett abziehen könnte.
 */
import type { ContentNavigationItem } from '@nuxt/content'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()

/**
 * Content-Pfad aus den Route-Params (NICHT aus route.path): unter /de/* trägt
 * der Pfad den Locale-Prefix, die Collection kennt nur `/docs/...`.
 */
const contentPath = computed(() => {
  const slug = route.params.slug
  const parts = (Array.isArray(slug) ? slug : [slug]).filter(Boolean)
  return parts.length ? `/docs/${parts.join('/')}` : '/docs'
})

const { data: navigation } = await useAsyncData(
  'internal-docs-navigation',
  () => queryCollectionNavigation('internalDocs'),
)

const { data: page } = await useAsyncData(
  () => `internal-docs:${contentPath.value}`,
  () => queryCollection('internalDocs').path(contentPath.value).first(),
  { watch: [contentPath] },
)

if (!page.value) {
  throw createError({ status: 404, statusText: 'Not found', fatal: true })
}

useHead({ title: () => page.value?.title || t('control.docs.title') })

/**
 * Navigations-Baum aufbereiten:
 *  - Links durch localePath(), sonst verliert die Navigation unter /de/* den Prefix.
 *  - `docs/content/index.md` hat bewusst keinen `title` (die Docs-App rendert
 *    dort eine Landing-Hero) — ohne Ersatz-Label bliebe der erste Eintrag leer.
 */
function localizeTree(items: ContentNavigationItem[]): ContentNavigationItem[] {
  return items.map(item => ({
    ...item,
    title: item.title || t('control.docs.overview'),
    path: localePath(item.path),
    ...(item.children ? { children: localizeTree(item.children) } : {}),
  }))
}

/**
 * Der `prefix: '/docs'` der Collection erzeugt einen künstlichen Wurzelknoten
 * „Docs" über allem — im Betreiber-Dashboard wäre das eine Ebene Nichts. Wir
 * hängen ihn ab und zeigen direkt die Abschnitte.
 */
const navItems = computed<ContentNavigationItem[]>(() => {
  const tree = navigation.value ?? []
  const root = tree.length === 1 && tree[0]?.path === '/docs' && tree[0]?.children?.length
    ? tree[0].children
    : tree
  return localizeTree(root)
})
</script>

<template>
  <UDashboardPanel id="internal-docs">
    <template #header>
      <UDashboardNavbar :title="t('control.docs.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex items-start gap-8">
        <aside class="sticky top-0 hidden w-60 shrink-0 lg:block">
          <UContentNavigation
            highlight
            :navigation="navItems"
            :default-open="true"
          />
        </aside>

        <article class="min-w-0 flex-1">
          <!-- Auf kleinen Bildschirmen die Navigation als Aufklapper über dem Text -->
          <UCollapsible class="mb-6 lg:hidden">
            <UButton
              color="neutral"
              variant="subtle"
              block
              icon="i-ph-list"
              :label="t('control.docs.nav')"
            />
            <template #content>
              <UContentNavigation
                highlight
                class="mt-3"
                :navigation="navItems"
                :default-open="true"
              />
            </template>
          </UCollapsible>

          <!-- Titel/Beschreibung stehen im Frontmatter; ContentRenderer gibt
               nur den Fließtext aus, daher hier als Kopf davor. -->
          <header v-if="page?.title" class="mb-8">
            <h1 class="text-3xl font-bold text-highlighted">{{ page.title }}</h1>
            <p v-if="page.description" class="mt-2 text-base text-muted">{{ page.description }}</p>
          </header>

          <ContentRenderer
            v-if="page"
            :value="page"
          />
        </article>
      </div>
    </template>
  </UDashboardPanel>
</template>
