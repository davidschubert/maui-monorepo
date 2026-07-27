import { rebaseSeoLinks, rebaseSeoMeta, resolveSeoOrigin } from '../../shared/seoOrigin'

/**
 * Der SEO-Kopf jeder App: lang/dir am <html>, hreflang-Alternates, canonical,
 * og:url + og:locale — EIN Aufruf in der `app.vue` (früher stand dieselbe
 * useLocaleHead/useHead-Kopie in jeder App).
 *
 * Mehr-Host-Betrieb (Gate `maui.seo.originFromRequest`, Core-Default AUS):
 * nuxt-i18n kennt nur EINE Basis-URL (`NUXT_PUBLIC_I18N_BASE_URL`) — im Pool
 * bedient derselbe Prozess viele Hosts, und alle Kopf-URLs zeigten deshalb auf
 * den Betreiber-Host (Audit-Befund B1). Mit aktivem Gate liefert der
 * Request-Host die Basis, die Env nur noch das Schema (shared/seoOrigin.ts).
 *
 * Silo-Apps (comments, portfolio, control, marketing) lassen das Gate aus und
 * bekommen unverändert den Kopf, den useLocaleHead mit ihrer Env-Basis baut.
 *
 * Kein Hydration-Risiko: `useRequestURL()` liefert im SSR den Request-Host und
 * im Browser `location` — auf demselben Host also denselben Origin.
 *
 * Bewusst NICHT über `i18n.baseUrl` als Funktion gelöst: nuxt-i18n 10.4 hat
 * diese Form deprecated (Entfernung in v11) und wertet sie nur im Vue-Kontext
 * aus, während sie durch die runtimeConfig-Serialisierung des Prod-Builds
 * nicht überlebt.
 */
export function useLocaleSeoHead(): void {
  const localeHead = useLocaleHead({ seo: true, lang: true, dir: true })
  const appConfig = useAppConfig() as { maui?: { seo?: { originFromRequest?: boolean } } }
  const requestUrl = useRequestURL()
  const publicConfig = useRuntimeConfig().public as { i18n?: { baseUrl?: unknown } }
  const configuredBaseUrl = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl : ''

  // '' = kein Umschreiben (Silo-Apps + jeder Fall, in dem kein Origin steht)
  const origin = appConfig.maui?.seo?.originFromRequest === true
    ? resolveSeoOrigin(requestUrl.origin, configuredBaseUrl)
    : ''

  useHead(() => ({
    htmlAttrs: localeHead.value.htmlAttrs,
    link: rebaseSeoLinks(localeHead.value.link, origin),
    meta: rebaseSeoMeta(localeHead.value.meta, origin),
  }))
}
