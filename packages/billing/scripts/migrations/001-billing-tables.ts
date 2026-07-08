/**
 * Migration billing-001: billing_customers + billing_subscriptions (Phase 23).
 *
 * Projektion des Stripe-Zustands (Stripe = Source of Truth, B3): Writes NUR
 * server-seitig (Checkout/Webhook via Admin-Client) — die Tables tragen KEINE
 * create/update-Permissions; Rows bekommen read(user:<userId>) beim Anlegen.
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer billing
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration billing-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table billing_customers', () => tablesDB.createTable({
  databaseId, tableId: 'billing_customers', name: 'Billing Customers', permissions: [], rowSecurity: true,
}))
const custCols = await existingColumnKeys('billing_customers')
await columnStep('Column billing_customers.userId', 'userId', custCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_customers', key: 'userId', size: 36, required: true,
}))
await columnStep('Column billing_customers.stripeCustomerId', 'stripeCustomerId', custCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_customers', key: 'stripeCustomerId', size: 64, required: true,
}))
await columnStep('Column billing_customers.email', 'email', custCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_customers', key: 'email', size: 320, required: false, xdefault: '',
}))

await step('Table billing_subscriptions', () => tablesDB.createTable({
  databaseId, tableId: 'billing_subscriptions', name: 'Billing Subscriptions', permissions: [], rowSecurity: true,
}))
const subCols = await existingColumnKeys('billing_subscriptions')
await columnStep('Column billing_subscriptions.userId', 'userId', subCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'userId', size: 36, required: true,
}))
await columnStep('Column billing_subscriptions.stripeCustomerId', 'stripeCustomerId', subCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'stripeCustomerId', size: 64, required: true,
}))
await columnStep('Column billing_subscriptions.stripeSubscriptionId', 'stripeSubscriptionId', subCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'stripeSubscriptionId', size: 64, required: true,
}))
await columnStep('Column billing_subscriptions.status', 'status', subCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'status', size: 20, required: true,
}))
await columnStep('Column billing_subscriptions.planId', 'planId', subCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'planId', size: 50, required: true,
}))
await columnStep('Column billing_subscriptions.priceId', 'priceId', subCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'priceId', size: 64, required: true,
}))
await columnStep('Column billing_subscriptions.currentPeriodEnd', 'currentPeriodEnd', subCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'currentPeriodEnd', required: true,
}))
await columnStep('Column billing_subscriptions.cancelAtPeriodEnd', 'cancelAtPeriodEnd', subCols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'cancelAtPeriodEnd', required: false, xdefault: false,
}))
await columnStep('Column billing_subscriptions.trialEnd', 'trialEnd', subCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'trialEnd', required: false,
}))
await columnStep('Column billing_subscriptions.lastStripeEventAt', 'lastStripeEventAt', subCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'billing_subscriptions', key: 'lastStripeEventAt', required: false, min: 0, xdefault: 0,
}))

await waitForColumns('billing_customers')
await waitForColumns('billing_subscriptions')

await step('Index billing_customers.uq_user', () => tablesDB.createIndex({
  databaseId, tableId: 'billing_customers', key: 'uq_user', type: TablesDBIndexType.Unique, columns: ['userId'],
}))
await step('Index billing_customers.uq_stripe_customer', () => tablesDB.createIndex({
  databaseId, tableId: 'billing_customers', key: 'uq_stripe_customer', type: TablesDBIndexType.Unique, columns: ['stripeCustomerId'],
}))
await step('Index billing_subscriptions.idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'billing_subscriptions', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
}))
await step('Index billing_subscriptions.idx_customer', () => tablesDB.createIndex({
  databaseId, tableId: 'billing_subscriptions', key: 'idx_customer', type: TablesDBIndexType.Key, columns: ['stripeCustomerId'],
}))
await step('Index billing_subscriptions.uq_stripe_sub', () => tablesDB.createIndex({
  databaseId, tableId: 'billing_subscriptions', key: 'uq_stripe_sub', type: TablesDBIndexType.Unique, columns: ['stripeSubscriptionId'],
}))

console.log('✔ Migration billing-001 fertig')
