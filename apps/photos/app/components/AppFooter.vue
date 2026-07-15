<script setup lang="ts">
const localePath = useLocalePath()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <p class="brand">maui<span>.photos</span></p>
        <p class="footer__tag">Fine-art photography from the islands of Maui.</p>
      </div>

      <div class="footer__cols">
        <div class="footer__col">
          <h4>Explore</h4>
          <NuxtLink :to="localePath('/gallery')">Gallery</NuxtLink>
          <NuxtLink :to="localePath('/about')">About</NuxtLink>
          <NuxtLink :to="localePath('/contact')">Contact</NuxtLink>
        </div>
        <div class="footer__col">
          <h4>Elsewhere</h4>
          <a href="#" rel="noopener">Instagram</a>
          <a href="#" rel="noopener">Behance</a>
          <a href="mailto:hello@maui.photos">Email</a>
        </div>
      </div>
    </div>

    <div class="container footer__bottom">
      <span>© {{ year }} maui.photos — All rights reserved.</span>
      <span>Made with aloha 🌺</span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 1px solid var(--line);
  background: var(--bg-soft);
  padding-top: clamp(3.5rem, 8vw, 6rem);
}
.footer__inner {
  display: flex;
  flex-wrap: wrap;
  gap: 3rem;
  justify-content: space-between;
  padding-bottom: 3.5rem;
}
.brand {
  font-family: var(--font-display);
  font-size: 1.6rem;
}
.brand span {
  color: var(--accent);
}
.footer__tag {
  color: var(--text-soft);
  margin-top: 0.75rem;
  max-width: 32ch;
}
.footer__cols {
  display: flex;
  gap: clamp(2.5rem, 6vw, 5rem);
}
.footer__col {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.footer__col h4 {
  font-family: var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  color: var(--text-soft);
  margin-bottom: 0.4rem;
}
.footer__col a {
  color: var(--text);
  font-size: 0.95rem;
  transition: color 0.3s var(--ease);
}
.footer__col a:hover {
  color: var(--accent);
}
.footer__bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  padding-block: 1.8rem;
  border-top: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 0.82rem;
}
</style>
