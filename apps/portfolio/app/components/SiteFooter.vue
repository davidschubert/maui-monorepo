<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <p class="footer__copy">© {{ new Date().getFullYear() }} David Schubert · {{ t('portfolio.footer.tagline') }}</p>
      <div class="footer__links">
        <a href="https://www.linkedin.com/in/davidschubert-uiux/" target="_blank" rel="noopener" class="footer__link">LinkedIn</a>
        <a href="https://github.com/davidschubert" target="_blank" rel="noopener" class="footer__link">GitHub</a>
        <a href="mailto:mail@davidschubert.com" class="footer__link">{{ t('portfolio.nav.contact') }}</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 1px solid var(--line);
  padding-block: 2rem;
}
.footer__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.footer__copy {
  color: var(--text-soft);
  font-size: 0.85rem;
}
.footer__links {
  display: flex;
  gap: 1.5rem;
}
.footer__link {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-soft);
  transition: color 0.3s var(--ease);
}
.footer__link:hover {
  color: var(--accent);
}
</style>
