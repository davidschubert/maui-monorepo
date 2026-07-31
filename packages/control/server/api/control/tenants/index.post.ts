import { ID } from 'node-appwrite'
import { tenantCreateSchema } from '../../../../schemas/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'

/**
 * Betreiber: neuen Tenant anlegen — DER Onboarding-Kern („neue Pool-Site" =
 * diese eine Row; die Platform-App löst den Host beim nächsten Request auf,
 * Resolver-Cache max. 30 s). UX 2026-07-23: der Betreiber liefert NAME + Host
 * (aus dem Namen vorgeschlagen); projectId ist im Pool-Modus der konfigurierte
 * Default (pukalani.control.defaultPoolProject), nur Silo MUSS eins nennen.
 * pool ohne tenantId → frische Id (t-…); doppelter Host → 409 via uq_host.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const body = await readValidatedBody(event, tenantCreateSchema.parse)

  const appConfig = useAppConfig() as { pukalani?: { control?: { defaultPoolProject?: string } } }
  const projectId = body.projectId ?? (body.mode === 'pool' ? appConfig.pukalani?.control?.defaultPoolProject : undefined)
  if (!projectId) {
    throw createError({ status: 400, statusText: 'Silo tenants need an explicit project id' })
  }
  const tenantId = body.mode === 'pool' ? (body.tenantId ?? `t-${ID.unique()}`) : ''

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.createRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    rowId: ID.unique(),
    // Bewusst ALLE Spalten explizit: so erzwingt der Compiler bei jeder neuen
    // tenants-Spalte eine Entscheidung, was eine per Hand angelegte Site dort
    // bekommt (statt sie stillschweigend auf null zu lassen). Der Betreiber-Weg
    // legt KEINE Testphase an — die gehört zum Self-Service-Onboarding.
    data: {
      name: body.name,
      host: body.host,
      mode: body.mode,
      projectId,
      tenantId,
      status: 'active',
      wave: body.wave ?? 'stable',
      plan: body.plan ?? 'basic',
      workspaceId: '',
      theme: '',
      variant: '',
      // Neutral-Palette (control-020, Rest von B5): '' = keine eigene Wahl, es
      // gilt die Voreinstellung der Instanz. Wie theme/variant.
      neutral: '',
      audience: 'members',
      trialEndsAt: null,
      profile: '',
      inviteCodeId: '',
      // Mitglieder-Registrierung offen (control-018, Default AN): explizit
      // geschrieben statt auf den Spalten-Default vertraut — dann trägt die Row
      // die Entscheidung selbst und der Resolver braucht keinen Fallback.
      openRegistration: true,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create tenant') })

  return { id: row.$id, name: row.name, host: row.host, mode: row.mode, projectId: row.projectId, tenantId: row.tenantId, status: row.status, wave: row.wave, plan: row.plan }
})
