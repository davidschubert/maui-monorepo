<script setup lang="ts">
// Sichtbares Branding über der Auth-Karte (Audit-Befund B3): /login ist für
// Mitglieder die meistgebookmarkte Seite eines Mandanten — der Community-Name
// muss im SSR-Markup stehen, nicht nur im JS-Payload. Bewusst zurückhaltend
// (eine Zeile, kein Logo/Claim): die UAuthForm-Optik der Karte bleibt der Held.
//
// Wird von JEDEM auth-Layout gerendert (core + themes-Override — App-Kopien
// gibt es seit der Layout-Konsolidierung S9 nicht mehr) — die Komponente
// hält die Kette (Tenant → App-Brand) an EINER Stelle.
const brand = useBrandName()
</script>

<template>
  <p
    data-auth-brand
    class="text-center text-sm font-semibold tracking-tight text-muted"
  >
    {{ brand }}
  </p>
</template>
