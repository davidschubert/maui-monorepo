<script setup lang="ts">
// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben.
// Zweistufiger Passwort-Login (E-Mail → Passwort); der Code-Login-Link zu
// /login/code sitzt in Schritt 2 von AuthLoginForm (config-gated über maui.auth.otp).
definePageMeta({ layout: 'auth', middleware: 'guest' })
</script>

<template>
  <AuthLoginForm />
</template>
