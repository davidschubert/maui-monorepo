<script setup lang="ts">
/**
 * Das Aktivitätsprotokoll DIESER Community, mit Lösch-Aktion.
 *
 * Seit F51 (2026-08-07) ein REITER des Community-Hubs
 * (/dashboard/community/activity) statt eines eigenen Sidebar-Eintrags im
 * Hauptmenü — Davids Entscheidung, alle community-bezogenen
 * Einstellungen in EINE Hülle zu ziehen. Panel, Kopfzeile und Scroll-Container
 * bringt die Hülle mit (packages/admin/app/pages/dashboard/community.vue);
 * diese Seite rendert nur noch ihren Inhalt.
 *
 * Die beiden Produkt-Gates (`productKey`/`planProduct`) sind mit dem Eintrag
 * umgezogen und stehen jetzt am Reiter — ohne sie wäre der Umzug ein stiller
 * Rechte-Verlust gewesen.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'activity.manage' })

const { t } = useI18n()

useHead({ title: () => t('activity.moderation.title') })
</script>

<template>
  <div class="flex w-full flex-col">
    <p class="text-sm text-muted">{{ t('activity.moderation.description') }}</p>

    <!-- BEWUSST KEINE UTable (B6): der Feed ist DIESELBE Komponente wie auf
         der öffentlichen Seite — nur mit Lösch-Aktion. Zwei Bauweisen für
         denselben Strom hieße zwei Wahrheiten; dazu kommen Bündelung
         („+N weitere") und Endlos-Nachladen, die eine Tabelle nicht trägt. -->
    <ActivityFeed class="mt-6" moderate />
  </div>
</template>
