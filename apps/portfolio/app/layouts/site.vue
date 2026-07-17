<script setup lang="ts">
// portfolio.css wirkt nur unter body.portfolio-site (Muster photos):
// Login/Dashboard (andere Layouts) behalten den Standard-Look der Plattform.
useHead({ bodyAttrs: { class: 'portfolio-site' } })
</script>

<template>
  <div class="site">
    <SiteHeader />
    <main>
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.site {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
main {
  flex: 1;
}
</style>
