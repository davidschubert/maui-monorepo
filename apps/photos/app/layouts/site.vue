<script setup lang="ts">
// photos.css wirkt nur unter body.photos-site (P2-Polish): Login/Dashboard
// (andere Layouts) behalten den Standard-Look der Plattform.
useHead({ bodyAttrs: { class: 'photos-site' } })
</script>

<template>
  <div class="site">
    <AppHeader />
    <main>
      <slot />
    </main>
    <AppFooter />
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
