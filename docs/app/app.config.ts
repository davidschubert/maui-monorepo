export default defineAppConfig({
  ui: {
    colors: {
      primary: 'teal',
      neutral: 'slate',
    },
    footer: {
      slots: {
        root: 'border-t border-default',
        left: 'text-sm text-muted',
      },
    },
  },
  seo: {
    siteName: 'Maui Docs',
  },
  header: {
    title: '🏝️ Maui Docs',
    to: '/',
    search: true,
    colorMode: true,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/davidschubert/maui-monorepo',
      'target': '_blank',
      'aria-label': 'GitHub',
    }],
  },
  footer: {
    credits: `Maui Monorepo · © ${new Date().getFullYear()}`,
    colorMode: false,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/davidschubert/maui-monorepo',
      'target': '_blank',
      'aria-label': 'Maui Monorepo auf GitHub',
    }],
  },
  toc: {
    title: 'Auf dieser Seite',
    bottom: {
      title: 'Vertiefung',
      edit: 'https://github.com/davidschubert/maui-monorepo/edit/main/docs/content',
      links: [{
        icon: 'i-lucide-book-open',
        label: 'Konzept (CONCEPT.md)',
        to: 'https://github.com/davidschubert/maui-monorepo/blob/main/docs/CONCEPT.md',
        target: '_blank',
      }, {
        icon: 'i-lucide-map',
        label: 'Roadmap (GOALS.md)',
        to: 'https://github.com/davidschubert/maui-monorepo/blob/main/docs/GOALS.md',
        target: '_blank',
      }],
    },
  },
})
