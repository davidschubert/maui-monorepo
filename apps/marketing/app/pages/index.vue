<script setup lang="ts">
// Die kinematische Startseite (Konzept §3.2 / §6.4). Szenen werden Paket für
// Paket ergänzt; die Reihenfolge im DOM = die Reihenfolge der Beats.
definePageMeta({ layout: 'site' })
useReveal()
</script>

<template>
  <div class="mkt-page">
    <HeroSection />
    <ProblemSection />
    <StepsSection />
    <!-- L4+: Bausteine · Modular · Datenschutz · Preise · FAQ · CTA -->
  </div>
</template>
