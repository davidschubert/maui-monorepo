<script setup lang="ts">
// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben.
// Zweistufiger Passwort-Login (E-Mail → Passwort); der Code-Login-Link zu
// /login/code sitzt in Schritt 2 von AuthLoginForm (config-gated über pukalani.auth.otp).
definePageMeta({ layout: 'auth', middleware: 'guest' })

// Seitentitel „Anmelden · <Brand>" (Audit-Befund B3): /login ist die
// meistgebookmarkte Seite eines Mandanten — der Tab/Lesezeichen-Name muss den
// Community-Namen tragen, nicht leer bleiben.
const { t } = useI18n()
useBrandTitle(() => t('auth.login.title'))
</script>

<template>
  <AuthLoginForm />
</template>
