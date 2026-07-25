<script setup lang="ts">
// marketing.css + die Licht-Dramaturgie wirken nur unter body.marketing-site —
// so bleiben etwaige Layer-Layouts (Login etc.) unberührt.
useHead({ bodyAttrs: { class: 'marketing-site' } })
</script>

<template>
  <div class="mkt-shell">
    <MarketingHeader />
    <main>
      <slot />
    </main>
    <MarketingFooter />
  </div>
</template>

<style scoped>
.mkt-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
main {
  flex: 1;
}
</style>
