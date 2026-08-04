import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_LIST_LIMIT,
  ANALYTICS_TOTAL_METRICS,
  buildStatsQueries,
  mapNamedCounts,
  mapSeries,
  mapTotals,
  mapVisitors,
  resolveStatsTarget,
} from '../shared/analyticsStats'

const OWN = 'pa-NFzv_HzyhC-TnVE577Kx6'
const SHARED = { scriptId: 'pa-nw6c94JiRWqzOc-zDcn1a', siteId: 'communities.pukalani.app' }
const HOST = 'kunde-a.pukalani.app'

describe('resolveStatsTarget', () => {
  it('fragt bei EIGENER Site den Host der Community — ohne Filter', () => {
    const target = resolveStatsTarget({ plausibleScriptId: OWN }, SHARED, HOST)
    expect(target).toEqual({ state: 'ready', siteId: HOST, filters: [] })
  })

  it('die eigene Site gewinnt auch, wenn der Schalter an ist', () => {
    const target = resolveStatsTarget({ plausibleScriptId: OWN, enabled: true }, SHARED, HOST)
    expect(target).toEqual({ state: 'ready', siteId: HOST, filters: [] })
  })

  /** Die eine Zeile, an der die ganze Trennung der Communities hängt. */
  it('fragt beim Schalter die Sammel-Site MIT Hostname-Filter', () => {
    const target = resolveStatsTarget({ plausibleScriptId: '', enabled: true }, SHARED, HOST)
    expect(target).toEqual({
      state: 'ready',
      siteId: 'communities.pukalani.app',
      filters: [['is', 'event:hostname', [HOST]]],
    })
  })

  it('ist aus, wenn weder Schalter noch eigene Site gesetzt sind', () => {
    expect(resolveStatsTarget({ plausibleScriptId: '', enabled: false }, SHARED, HOST)).toEqual({ state: 'off' })
    expect(resolveStatsTarget(null, SHARED, HOST)).toEqual({ state: 'off' })
    expect(resolveStatsTarget(undefined, SHARED, HOST)).toEqual({ state: 'off' })
  })

  it('ist aus, wenn der Schalter an ist, das Deployment aber keine Sammel-Site hat (Silo)', () => {
    expect(resolveStatsTarget({ enabled: true }, {}, HOST)).toEqual({ state: 'off' })
  })

  /**
   * Gegenprobe zur Fail-soft-Regel: „es wird gemessen, wir kommen nur nicht
   * dran" darf NIE zu „es wird nichts gemessen" werden.
   */
  it('meldet „nicht erreichbar", wenn die Sammel-Site keinen Site-Schlüssel hat', () => {
    expect(resolveStatsTarget({ enabled: true }, { scriptId: SHARED.scriptId }, HOST))
      .toEqual({ state: 'unavailable' })
  })

  it('meldet „nicht erreichbar" ohne Request-Host — in beiden Modi', () => {
    expect(resolveStatsTarget({ plausibleScriptId: OWN }, SHARED, '')).toEqual({ state: 'unavailable' })
    expect(resolveStatsTarget({ enabled: true }, SHARED, '')).toEqual({ state: 'unavailable' })
  })

  it('ignoriert eine unbrauchbare eigene Id und fällt auf den Schalter zurück', () => {
    const target = resolveStatsTarget({ plausibleScriptId: 'https://boese.example/x.js', enabled: true }, SHARED, HOST)
    expect(target).toEqual({
      state: 'ready',
      siteId: 'communities.pukalani.app',
      filters: [['is', 'event:hostname', [HOST]]],
    })
  })
})

describe('buildStatsQueries', () => {
  const queries = buildStatsQueries('communities.pukalani.app', [['is', 'event:hostname', [HOST]]])

  it('trägt Site und Filter in JEDE der fünf Abfragen', () => {
    for (const query of Object.values(queries)) {
      expect(query.site_id).toBe('communities.pukalani.app')
      expect(query.filters).toEqual([['is', 'event:hostname', [HOST]]])
    }
  })

  it('lässt `filters` ganz weg, wenn nicht gefiltert wird (eigene Site)', () => {
    const own = buildStatsQueries(HOST, [])
    for (const query of Object.values(own)) {
      expect('filters' in query).toBe(false)
    }
  })

  it('trennt „heute" und „30 Tage" — ein date_range gilt je Abfrage', () => {
    expect(queries.today.date_range).toBe('day')
    expect(queries.totals.date_range).toBe('30d')
    expect(queries.series.date_range).toBe('30d')
  })

  it('fragt die vier Übersichtszahlen in der Reihenfolge, in der sie gelesen werden', () => {
    expect(queries.totals.metrics).toEqual([...ANALYTICS_TOTAL_METRICS])
  })

  it('holt Zeitreihe, Seiten und Quellen über ihre Dimensionen', () => {
    expect(queries.series.dimensions).toEqual(['time:day'])
    expect(queries.topPages.dimensions).toEqual(['event:page'])
    expect(queries.topSources.dimensions).toEqual(['visit:source'])
    expect(queries.topPages.pagination).toEqual({ limit: ANALYTICS_LIST_LIMIT })
    expect(queries.topSources.pagination).toEqual({ limit: ANALYTICS_LIST_LIMIT })
  })
})

describe('Antwort-Mapping', () => {
  it('liest die Besucherzahl von heute', () => {
    expect(mapVisitors({ results: [{ metrics: [42], dimensions: [] }] })).toBe(42)
  })

  it('liest die vier Übersichtszahlen in der Reihenfolge der Metriken', () => {
    expect(mapTotals({ results: [{ metrics: [120, 350, 94.6, 41.2], dimensions: [] }] })).toEqual({
      visitors: 120,
      pageviews: 350,
      visitDurationSeconds: 95,
      bounceRate: 41.2,
    })
  })

  it('liest die Tagesreihe mit ihren Datumsangaben', () => {
    expect(mapSeries({
      results: [
        { metrics: [3], dimensions: ['2026-08-03'] },
        { metrics: [7], dimensions: ['2026-08-04'] },
      ],
    })).toEqual([
      { date: '2026-08-03', visitors: 3 },
      { date: '2026-08-04', visitors: 7 },
    ])
  })

  it('liest Top-Listen und lässt namenlose Zeilen weg (Direktzugriff)', () => {
    expect(mapNamedCounts({
      results: [
        { metrics: [9], dimensions: ['/blog'] },
        { metrics: [4], dimensions: [''] },
      ],
    })).toEqual([{ name: '/blog', visitors: 9 }])
  })

  /**
   * Der eigentliche Zweck der Mapper: aus einer unerwarteten Antwort darf
   * niemals „NaN" in einer Kachel werden — das sähe nach einem Fehler in
   * UNSEREM Dashboard aus, nicht nach fehlenden Daten.
   */
  it('macht aus fehlenden oder falsch getippten Werten 0 statt NaN', () => {
    expect(mapVisitors({})).toBe(0)
    expect(mapVisitors({ results: [] })).toBe(0)
    expect(mapVisitors({ results: [{ metrics: ['viele'], dimensions: [] }] })).toBe(0)
    expect(mapTotals({}).pageviews).toBe(0)
    expect(mapSeries({})).toEqual([])
    expect(mapNamedCounts({})).toEqual([])
  })
})
