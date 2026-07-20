<script setup lang="ts">
const localePath = useLocalePath()
const scrolled = ref(false)
const open = ref(false)

const onScroll = () => {
  scrolled.value = window.scrollY > 24
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

const links = [
  { to: '/', label: 'Home' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]
</script>

<template>
  <header class="header" :class="{ 'is-scrolled': scrolled }">
    <div class="header__inner container">
      <NuxtLink to="/" class="brand" @click="() => { open = false }">
        maui<span>.photos</span>
      </NuxtLink>

      <nav class="nav" :class="{ 'is-open': open }">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="localePath(link.to)"
          class="nav__link"
          @click="() => { open = false }"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <button
        class="burger"
        :class="{ 'is-open': open }"
        :aria-expanded="open"
        aria-label="Toggle menu"
        @click="() => { open = !open }"
      >
        <span /><span /><span />
      </button>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 100;
  padding-block: 1.4rem;
  transition: background 0.5s var(--ease), padding 0.5s var(--ease),
    border-color 0.5s var(--ease);
  border-bottom: 1px solid transparent;
}
.header.is-scrolled {
  padding-block: 0.9rem;
  background: rgba(11, 12, 14, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom-color: var(--line);
}
.header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  font-family: var(--font-display);
  font-size: 1.5rem;
  letter-spacing: 0.01em;
}
.brand span {
  color: var(--accent);
}
.nav {
  display: flex;
  gap: 2.2rem;
}
.nav__link {
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-soft);
  position: relative;
  padding-block: 0.35rem;
  transition: color 0.3s var(--ease);
}
.nav__link::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 1px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 0.4s var(--ease);
}
.nav__link:hover,
.nav__link.router-link-exact-active {
  color: var(--text);
}
.nav__link:hover::after,
.nav__link.router-link-exact-active::after {
  transform: scaleX(1);
  transform-origin: left;
}
.burger {
  display: none;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: 0;
  cursor: pointer;
  padding: 6px;
}
.burger span {
  width: 26px;
  height: 2px;
  background: var(--text);
  transition: transform 0.4s var(--ease), opacity 0.3s var(--ease);
}
.burger.is-open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.burger.is-open span:nth-child(2) {
  opacity: 0;
}
.burger.is-open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

@media (max-width: 760px) {
  .burger {
    display: flex;
  }
  .nav {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(78vw, 320px);
    flex-direction: column;
    justify-content: center;
    gap: 1.8rem;
    padding: 2rem;
    background: var(--bg-soft);
    border-left: 1px solid var(--line);
    transform: translateX(100%);
    transition: transform 0.5s var(--ease);
  }
  .nav.is-open {
    transform: none;
  }
  .nav__link {
    font-size: 1rem;
  }
}
</style>
