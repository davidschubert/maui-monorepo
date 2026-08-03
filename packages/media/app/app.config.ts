/**
 * media meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // E9: die Mediathek ist INHALT einer Community, kein Branding —
          // sie zieht aus dem entfallenen 'design' zu den Produkten (hinter
          // Beiträge/Events/Kurse).
          id: 'media',
          scope: 'community',
          productKey: 'media',
          // C2: im Pool erst ab personal (pukalani.tenancy.products) — ohne
          // das Feld stünde der Menüpunkt auch dort, wo /api/media längst
          // 404t. `productKey` ist der BETREIBER-Schalter (app_config),
          // `planProduct` der Vertrag des Kunden; beide sind nötig.
          planProduct: 'media',
          labelKey: 'admin.nav.media',
          icon: 'i-ph-images',
          to: '/dashboard/media',
          requiredCapability: 'media.manage',
          group: 'products',
          order: 5,
        },
      ],
    },
  },
})
