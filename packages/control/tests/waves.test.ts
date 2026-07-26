import { describe, expect, it } from 'vitest'
import { siloProjectsForWave } from '../shared/waves'

const t = (mode: 'pool' | 'silo', projectId: string, wave: 'internal' | 'canary' | 'stable' | '') =>
  ({ mode, projectId, wave })

describe('siloProjectsForWave (H3-4.2 Wellen-Runner)', () => {
  it('filtert nach Welle und liefert nur Silo-Projekte', () => {
    const tenants = [
      t('silo', 'kunde-a', 'canary'),
      t('silo', 'kunde-b', 'stable'),
      t('pool', 'pool', 'canary'), // Pool zählt NIE mit — ein geteiltes Projekt
    ]
    expect(siloProjectsForWave(tenants, 'canary')).toEqual(['kunde-a'])
    expect(siloProjectsForWave(tenants, 'stable')).toEqual(['kunde-b'])
    expect(siloProjectsForWave(tenants, 'internal')).toEqual([])
  })
  it('Bestand ohne Welle (\'\', vor studio-012) gilt als stable', () => {
    expect(siloProjectsForWave([t('silo', 'alt', '')], 'stable')).toEqual(['alt'])
    expect(siloProjectsForWave([t('silo', 'alt', '')], 'canary')).toEqual([])
  })
  it('dedupliziert Projekte (mehrere Hosts → ein Projekt) und sortiert', () => {
    const tenants = [
      t('silo', 'zeta', 'stable'),
      t('silo', 'alpha', 'stable'),
      t('silo', 'alpha', 'stable'),
    ]
    expect(siloProjectsForWave(tenants, 'stable')).toEqual(['alpha', 'zeta'])
  })
  it('leere projectId wird ignoriert (Datenfehler, nie migrieren)', () => {
    expect(siloProjectsForWave([t('silo', '', 'stable')], 'stable')).toEqual([])
  })
})
