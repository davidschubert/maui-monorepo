import crypto from 'node:crypto'
import { Client, TablesDB, ID } from 'node-appwrite'
import { parseCommitsToDraft } from './parse.js'

/**
 * Changelog-Draft (Track 2B) — vollautomatischer Produkt-Changelog-Entwurf.
 *
 * Läuft INNERHALB von Appwrite (erreicht die DB direkt — löst das localhost-
 * Problem von Track 2A). Zwei Auslöser:
 *
 *  1) GitHub-Release-Webhook (X-GitHub-Event: release, action=published):
 *     HMAC-verifiziert (GITHUB_WEBHOOK_SECRET). Holt die Commits zwischen dem
 *     vorherigen und dem neuen Tag über die GitHub-Compare-API und legt EINEN
 *     Entwurf (published:false) an. Denselben polierst du im Dashboard.
 *
 *  2) Manueller POST { "since": "v1.4.0", "until": "HEAD"|"v1.5.0", "version": "v1.5" }
 *     (Appwrite-Console „Execute now" oder authentifizierter Aufruf) — nützlich
 *     zum Testen ohne echten Release.
 *
 * Wiederverwendet die Parsing-Logik aus Track 2A (./parse.js) — eine Quelle.
 *
 * Erwartete Function-Variablen (Appwrite Console → Function → Settings → Variables):
 *   APPWRITE_DATABASE_ID    Ziel-DB (z.B. "main")
 *   GITHUB_REPO             "owner/repo" (z.B. "davidschubert/maui-monorepo")
 *   GITHUB_WEBHOOK_SECRET   Shared Secret des GitHub-Webhooks (HMAC-SHA256)
 *   GITHUB_TOKEN            optional (private Repos / höheres Rate-Limit)
 * Dynamischer API-Key: Appwrite injiziert ihn als Header x-appwrite-key
 *   (Function-Scope tablesDB.rows.* nötig).
 */
export default async ({ req, res, log, error }) => {
  try {
    const databaseId = process.env.APPWRITE_DATABASE_ID
    const repo = process.env.GITHUB_REPO
    if (!databaseId || !repo) {
      error('APPWRITE_DATABASE_ID oder GITHUB_REPO fehlt.')
      return res.json({ ok: false, message: 'Function nicht konfiguriert.' }, 500)
    }

    const event = req.headers['x-github-event']
    let since = ''
    let until = 'HEAD'
    let version = ''

    if (event) {
      // ── GitHub-Webhook-Pfad ────────────────────────────────────────────
      if (!verifyGithubSignature(req, process.env.GITHUB_WEBHOOK_SECRET, error)) {
        return res.json({ ok: false, message: 'Ungültige Signatur.' }, 401)
      }
      if (event !== 'release') {
        return res.json({ ok: true, skipped: `event ${event} ignoriert` })
      }
      const payload = safeJson(req.bodyRaw)
      if (payload?.action !== 'published') {
        return res.json({ ok: true, skipped: `release action ${payload?.action} ignoriert` })
      }
      const tag = payload?.release?.tag_name
      if (!tag) return res.json({ ok: false, message: 'release.tag_name fehlt.' }, 422)
      version = tag
      until = tag
      since = await previousTag(repo, tag, log)
      if (!since) {
        return res.json({ ok: false, message: `Kein Vorgänger-Tag zu ${tag} gefunden — manuell mit "since" auslösen.` }, 422)
      }
    }
    else {
      // ── Manueller Pfad ─────────────────────────────────────────────────
      // Die Function ist execute:any (der GitHub-Webhook kommt als Gast über
      // die Function-Domain) — der manuelle Pfad braucht deshalb ein eigenes
      // Gate, sonst kann jeder Gast Draft-Spam anlegen + GitHub-Rate-Limit
      // verbrennen. Shared Secret im Header (timing-safe verglichen).
      const secret = process.env.GITHUB_WEBHOOK_SECRET
      const provided = req.headers['x-manual-secret']
      const authorized = Boolean(secret && provided)
        && Buffer.from(String(provided)).length === Buffer.from(secret).length
        && crypto.timingSafeEqual(Buffer.from(String(provided)), Buffer.from(secret))
      if (!authorized) {
        return res.json({ ok: false, message: 'Nicht autorisiert (x-manual-secret).' }, 401)
      }
      const body = safeJson(req.bodyRaw) ?? {}
      since = body.since ?? ''
      until = body.until ?? 'HEAD'
      version = body.version ?? (until !== 'HEAD' ? until : '')
      if (!since) return res.json({ ok: false, message: 'Bitte "since" (Tag/SHA) angeben.' }, 422)
    }

    // ── Commits holen + parsen ───────────────────────────────────────────
    const subjects = await compareSubjects(repo, since, until, log)
    const draft = parseCommitsToDraft(subjects, { version, range: `${since}..${until}` })
    if (draft.counted === 0) {
      return res.json({ ok: true, counted: 0, message: `Keine relevanten Commits in ${since}..${until}.` })
    }

    // ── Entwurf anlegen (published:false) ────────────────────────────────
    // Ausschließlich der dynamische, pro Execution injizierte Key — kein
    // statischer Env-Fallback (wäre ein langlebiger Breitband-Key).
    const apiKey = req.headers['x-appwrite-key']
    if (!apiKey) {
      error('Kein dynamischer API-Key (x-appwrite-key) — Function-Runtime prüfen.')
      return res.json({ ok: false, message: 'Interner Fehler.' }, 500)
    }
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(apiKey)
    const db = new TablesDB(client)
    const row = await db.createRow({
      databaseId,
      tableId: 'changelog',
      rowId: ID.unique(),
      data: {
        title: draft.title,
        body: draft.body,
        category: draft.category,
        version,
        published: false,
        date: new Date().toISOString(),
      },
    })
    log(`Entwurf ${row.$id} aus ${draft.counted} Commit(s) angelegt.`)
    return res.json({ ok: true, id: row.$id, counted: draft.counted, category: draft.category })
  }
  catch (err) {
    error(`changelog-draft fehlgeschlagen: ${err?.message ?? err}`)
    return res.json({ ok: false, message: 'Interner Fehler.' }, 500)
  }
}

/** HMAC-SHA256-Signatur des GitHub-Webhooks prüfen (timing-safe). */
function verifyGithubSignature(req, secret, error) {
  if (!secret) { error('GITHUB_WEBHOOK_SECRET fehlt — Webhook abgelehnt.'); return false }
  const sig = req.headers['x-hub-signature-256']
  if (!sig) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.bodyRaw ?? '').digest('hex')}`
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function safeJson(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw }
  catch { return null }
}

/** GitHub-API-Header (optionales Token für private Repos / Rate-Limit). */
function githubHeaders() {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'maui-changelog-draft' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

/** Das Tag unmittelbar vor `tag` (nächster Eintrag in der Tag-Liste). */
async function previousTag(repo, tag, log) {
  const resp = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=100`, { headers: githubHeaders() })
  if (!resp.ok) { log(`GitHub /tags ${resp.status}`); return '' }
  const tags = await resp.json()
  const idx = tags.findIndex(t => t.name === tag)
  return idx >= 0 && tags[idx + 1] ? tags[idx + 1].name : ''
}

/** Commit-Betreffzeilen zwischen base und head über die Compare-API. */
async function compareSubjects(repo, base, head, log) {
  const resp = await fetch(`https://api.github.com/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`, { headers: githubHeaders() })
  if (!resp.ok) { log(`GitHub /compare ${resp.status}`); throw new Error(`GitHub compare ${resp.status}`) }
  const data = await resp.json()
  return (data.commits ?? []).map(c => String(c.commit?.message ?? '').split('\n')[0])
}
