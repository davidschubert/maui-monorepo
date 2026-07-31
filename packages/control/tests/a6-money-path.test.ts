import { describe, expect, it } from 'vitest'
import { subscriptionUpdateToAction } from '../shared/workspaceBilling'
import type { ControlPlanCatalog } from '../shared/types/workspace'

/**
 * A6 Schritt 0 — der Befund als Test, ohne Stripe zu klicken:
 * „Ein Pool-Kunde könnte bezahlen und bliebe auf basic."
 *
 * Der GESAMTE Workspace-Geldpfad entscheidet über `metadata.workspaceId` und
 * wirkt auf `workspaces.plan` (applyWorkspacePlan). Eine Community kommt darin
 * nicht vor: ein Abo-Ereignis, das eine Community meint (communityId-Metadata),
 * wird von DIESEM Pfad ignoriert. Seit A6 Schritt 2 übernimmt der
 * Community-Pfad solche Events (communityBilling.test.ts) — dieser Test
 * dokumentiert die saubere Trennung der beiden Pfade im Übergang.
 */

const plans: ControlPlanCatalog = {
  basic: { lookupKey: null, products: ['comments'] },
  personal: { lookupKey: 'workspace_personal_monthly', products: ['comments', 'posts'] },
}

describe('A6 Schritt 0 — der Workspace-Geldpfad kennt nur Workspaces', () => {
  it('ein bezahltes Abo MIT communityId-Metadata (aber ohne workspaceId) verpufft hier', () => {
    const action = subscriptionUpdateToAction({
      status: 'active',
      metadata: { communityId: 't-kunde-123', plan: 'personal' },
      stripeSubscriptionId: 'sub_1',
    }, plans)
    expect(action).toEqual({ kind: 'ignore', reason: 'no-workspace-metadata' })
  })

  it('nur workspaceId-Metadata führt zu einer Wirkung — und die zielt auf den WORKSPACE', () => {
    const action = subscriptionUpdateToAction({
      status: 'active',
      metadata: { workspaceId: 'ws-1', plan: 'personal' },
      stripeSubscriptionId: 'sub_1',
    }, plans)
    expect(action).toEqual({ kind: 'apply-plan', workspaceId: 'ws-1', plan: 'personal', stripeSubscriptionId: 'sub_1' })
  })

  it('auch Kündigung und Zahlungsverzug wirken hier nur auf den Workspace', () => {
    expect(subscriptionUpdateToAction({ status: 'past_due', metadata: { communityId: 't-1' }, stripeSubscriptionId: 's' }, plans).kind).toBe('ignore')
    expect(subscriptionUpdateToAction({ status: 'canceled', metadata: { communityId: 't-1' }, stripeSubscriptionId: 's' }, plans).kind).toBe('ignore')
  })
})
