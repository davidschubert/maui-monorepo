import { safeRedirectTarget } from '../../shared/redirectTarget'

/**
 * Route-Middleware für geschützte Pages: definePageMeta({ middleware: 'auth' })
 *
 * Das ursprüngliche Ziel reist als `?redirect=` mit — sonst landet z. B. der
 * Eingeladene, der `start.pukalani.app?code=…` anklickt, nach der Anmeldung
 * auf der Startseite und sein Code ist weg. `safeRedirectTarget` verhindert,
 * dass daraus eine Weiterleitung nach außen wird.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!useAuthStore().isLoggedIn) {
    const target = safeRedirectTarget(to.fullPath)
    return navigateTo({
      path: useLocalePath()('/login'),
      ...(target ? { query: { redirect: target } } : {}),
    })
  }
})
