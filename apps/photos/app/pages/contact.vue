<script setup lang="ts">
definePageMeta({ layout: 'site' })

useHead({
  title: 'Contact — maui.photos',
  meta: [
    {
      name: 'description',
      content: 'Contact maui.photos for prints, commissions and licensing.',
    },
  ],
})

const form = reactive({ name: '', email: '', message: '' })
const sent = ref(false)

// No backend yet — this opens the visitor's mail client. Swap for a real
// endpoint (e.g. a Nuxt server route or a form service) when ready.
const submit = () => {
  const subject = encodeURIComponent('Enquiry via maui.photos')
  const body = encodeURIComponent(
    `${form.message}\n\n— ${form.name} (${form.email})`,
  )
  window.location.href = `mailto:hello@maui.photos?subject=${subject}&body=${body}`
  sent.value = true
}
</script>

<template>
  <div>
    <section class="page-head">
      <div class="container reveal">
        <p class="eyebrow">Contact</p>
        <h1 class="page-head__title">Prints & commissions.</h1>
        <p class="page-head__lead">
          For fine-art prints, licensing or a bespoke commission on Maui, send a
          note below or email
          <a href="mailto:hello@maui.photos">hello@maui.photos</a>.
        </p>
      </div>
    </section>

    <section class="section container contact">
      <form class="form" @submit.prevent="submit">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" v-model="form.name" type="text" required />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="form.email" type="email" required />
        </div>
        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" v-model="form.message" rows="5" required />
        </div>
        <button type="submit" class="btn btn--solid">Send message</button>
        <p v-if="sent" class="form__note">
          Thanks — your mail client should have opened. If not, email us
          directly at hello@maui.photos.
        </p>
      </form>

      <aside class="contact__aside">
        <div class="contact__block">
          <h3>Studio</h3>
          <p>Maui, Hawaiʻi<br />By appointment</p>
        </div>
        <div class="contact__block">
          <h3>Enquiries</h3>
          <p><a href="mailto:hello@maui.photos">hello@maui.photos</a></p>
        </div>
        <div class="contact__block">
          <h3>Follow</h3>
          <p><a href="#">Instagram</a> · <a href="#">Behance</a></p>
        </div>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.page-head {
  padding-top: clamp(8rem, 18vh, 12rem);
  padding-bottom: clamp(1rem, 3vw, 2rem);
}
.page-head__title {
  font-size: clamp(2.6rem, 8vw, 5rem);
  margin-top: 0.6rem;
}
.page-head__lead {
  color: var(--text-soft);
  font-size: 1.1rem;
  max-width: 52ch;
  margin-top: 1.2rem;
}
.page-head__lead a {
  color: var(--accent);
}
.contact {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.field label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-soft);
}
.field input,
.field textarea {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.9rem 1rem;
  color: var(--text);
  font-family: inherit;
  font-size: 1rem;
  transition: border-color 0.3s var(--ease);
}
.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.form .btn {
  align-self: flex-start;
  margin-top: 0.4rem;
}
.form__note {
  color: var(--accent-soft);
  font-size: 0.9rem;
}
.contact__aside {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-top: 0.4rem;
}
.contact__block h3 {
  font-family: var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  color: var(--accent);
  margin-bottom: 0.5rem;
}
.contact__block p {
  color: var(--text-soft);
  line-height: 1.7;
}
.contact__block a {
  color: var(--text);
}
.contact__block a:hover {
  color: var(--accent);
}

@media (max-width: 760px) {
  .contact {
    grid-template-columns: 1fr;
  }
}
</style>
