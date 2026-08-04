<script setup lang="ts">
import { GUIDELINES_SLUG, type PublicPageNavItem } from '../../../pages/shared/types/page'

/**
 * Die Zusatz-Punkte unter der Discussions-Seitenleiste (F1 Stufe 2, seit
 * Stufe 4 auch „Abzeichen").
 *
 * WARUM SIE NICHT IN `DiscussionSidebar` STEHEN (dem naheliegenden Ort): jene
 * Komponente gehört dem posts-Layer, und diese Punkte hängen an anderen Layern
 * — „Über" führt zu einer Seite, die drei Layer zusammenrechnet, „Regeln" zu
 * einem Text aus dem pages-Layer. Ein Produkt-Layer darf einen anderen nicht
 * kennen (A14); die Verdrahtung gehört nach blueprint. Deshalb steht die
 * Kategorien-Leiste weiter in posts und dieser Anhang daneben.
 *
 * „ABZEICHEN" STEHT AUCH HIER, obwohl seine Seite nur aus `posts` gespeist
 * wird: der ADRESSRAUM `/discussions/*` gehört dem Bauplan, und ein Menü,
 * dessen Punkte teils hier und teils dort stehen, hätte zwei Stellen zum
 * Vergessen. Der Punkt erscheint IMMER — die Galerie zeigt Gästen den
 * Katalog statt einer Anmelde-Schranke.
 *
 * ── „REGELN" ERSCHEINT NUR, WENN ES SIE GIBT ───────────────────────────────
 * Zwei Fälle, in denen es die Seite NICHT gibt, und beide sind normal:
 *  - eine App ohne pages-Layer (apps/comments) — dort antwortet die Route 404,
 *  - eine Community, die vor Stufe 2 angelegt wurde (der Seed läuft nur bei
 *    der Provisionierung) oder deren Owner die Seite gelöscht hat.
 * Ein fester Link wäre in beiden Fällen ein Verweis ins Leere — und
 * ausgerechnet bei „Regeln" ist das mehr als ein Schönheitsfehler: er
 * verspricht ein Regelwerk, das niemand nachlesen kann.
 *
 * GEPRÜFT WIRD ÜBER DIE SEITEN-NAVIGATION, nicht über einen eigenen Abruf der
 * Seite: `/api/pages/public` liefert ohnehin die Liste der veröffentlichten
 * Seiten, und das default-Layout holt sie unter GENAU DIESEM Schlüssel schon
 * für Kopf und Fuß. Derselbe Schlüssel heißt: ein Request, geteilter
 * SSR-Payload, kein zusätzlicher Abruf auf jeder Discussions-Seite. Fehlt der
 * pages-Layer, ist die Liste leer (die Route gibt es dann nicht) — und der
 * Punkt verschwindet ohne Sonderfall.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const requestFetch = useRequestFetch()

const { data: navPages } = await useAsyncData(
  () => `chrome-nav-pages-${locale.value}`,
  () => requestFetch<PublicPageNavItem[]>('/api/pages/public', { query: { locale: locale.value } })
    .catch(() => [] as PublicPageNavItem[]),
  { watch: [locale] },
)

/** Der TITEL kommt aus der Seite selbst, nicht aus i18n: der Owner darf sie
 *  umbenennen, und dann soll im Menü stehen, was oben auf der Seite steht. */
const guidelines = computed(() => (navPages.value ?? []).find(page => page.slug === GUIDELINES_SLUG) ?? null)
</script>

<template>
  <nav class="mt-6 border-t border-default pt-3">
    <ul class="space-y-1 text-sm">
      <li>
        <NuxtLink
          :to="localePath('/discussions/about')"
          class="block truncate rounded px-2 py-1 text-muted hover:bg-elevated/50 hover:text-default"
        >
          {{ t('posts.discussions.about.title') }}
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          :to="localePath('/discussions/badges')"
          class="block truncate rounded px-2 py-1 text-muted hover:bg-elevated/50 hover:text-default"
        >
          {{ t('posts.discussions.badges.title') }}
        </NuxtLink>
      </li>
      <li v-if="guidelines">
        <NuxtLink
          :to="localePath(`/${guidelines.slug}`)"
          class="block truncate rounded px-2 py-1 text-muted hover:bg-elevated/50 hover:text-default"
        >
          {{ guidelines.title }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
