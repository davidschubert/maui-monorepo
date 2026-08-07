/**
 * EIN WINZIGER DNS-SERVER — nur für den Beweis der eigenen Domains.
 *
 * WARUM ES IHN GIBT: die letzten zwei Schritte der Freischaltung
 * (Appwrite-Web-Platform + `active`) sind erst erreichbar, wenn der
 * Eigentums-Nachweis und die Zeige-Prüfung WIRKLICH halten. Beides hängt an
 * echten DNS-Einträgen in einer fremden Zone — die kann ein lokaler Beweis
 * nicht anlegen. Ohne dieses Stück endete der Rundlauf bei `pending_dns`, und
 * der Appwrite-Schritt (F45) wäre nur von Hand mit curl gemessen, nicht durch
 * den Code gelaufen.
 *
 * ── WAS IHN VON EINEM MOCK UNTERSCHEIDET ──────────────────────────────────
 * Er ist KEIN Mock der Prüfung, sondern ein Ersatz für die ZONE. Der Server
 * fragt weiterhin über `node:dns` mit echten Paketen, echtem Timeout und
 * echtem Parsen; er bekommt seine Antwort nur von hier statt von Cloudflare.
 * Und vor allem: **alles, was dieser Stub nicht selbst besitzt, leitet er
 * unverändert an einen echten Resolver weiter** (1.1.1.1). Damit bleiben die
 * Abschnitte des Beweises, die gegen ECHTE öffentliche Records messen,
 * ehrlich — ein Stub, der alles beantwortet, hätte genau die still grün
 * gefärbt.
 *
 * Ein Mock hätte man auch billiger haben können, indem der Trockenlauf die
 * DNS-Prüfung überspringt. Genau das wäre die Attrappe gewesen: dann bewiese
 * der Rundlauf, dass die Zustandsmaschine läuft, wenn man ihr nichts
 * abverlangt.
 *
 * ── GRENZEN, DIE BLEIBEN ──────────────────────────────────────────────────
 * ploi und Let's Encrypt ersetzt er NICHT (der Trockenlauf überspringt beide),
 * und die HTTPS-Probe entfällt dort ebenfalls. Der echte Zertifikatsweg wird
 * beim ersten Kunden bewiesen — Runbook CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md.
 *
 * Unterstützt genau drei Fragetypen, weil `checkDomainDns` genau drei stellt:
 * TXT (16), A (1), CNAME (5). CNAME beantwortet er als „gibt es nicht"
 * (RCODE 0, keine Antwort) — das ist der ENODATA-Pfad, den der echte Code als
 * unauffällig behandelt.
 */
import { createSocket } from 'node:dgram'

const TYPE_A = 1
const TYPE_CNAME = 5
const TYPE_TXT = 16

/** QNAME ab Offset lesen → { name, offset } (ohne Kompression: eine Frage). */
function readName(buffer, start) {
  const labels = []
  let offset = start
  while (offset < buffer.length) {
    const length = buffer[offset]
    if (length === 0) {
      offset += 1
      break
    }
    labels.push(buffer.subarray(offset + 1, offset + 1 + length).toString('utf8'))
    offset += 1 + length
  }
  return { name: labels.join('.').toLowerCase(), offset }
}

function answerHeader(query, count, rcode = 0) {
  const header = Buffer.alloc(12)
  query.copy(header, 0, 0, 2) // Id spiegeln
  // QR=1, Opcode=0, AA=1, RD aus der Frage übernehmen, RA=1
  header.writeUInt16BE(0x8580 | (query.readUInt16BE(2) & 0x0100) | rcode, 2)
  header.writeUInt16BE(1, 4) // QDCOUNT
  header.writeUInt16BE(count, 6) // ANCOUNT
  return header
}

function record(type, rdata, ttl = 30) {
  const head = Buffer.alloc(12)
  head.writeUInt16BE(0xC00C, 0) // Zeiger auf den Namen der Frage
  head.writeUInt16BE(type, 2)
  head.writeUInt16BE(1, 4) // IN
  head.writeUInt32BE(ttl, 6)
  head.writeUInt16BE(rdata.length, 10)
  return Buffer.concat([head, rdata])
}

function txtRdata(value) {
  // TXT ist eine Folge längen-präfixierter Stücke (max. 255) — genau die
  // Zerlegung, für die `customDomainTokenPresent` die Stücke wieder
  // zusammensetzt.
  const chunks = []
  for (let i = 0; i < value.length; i += 255) {
    const part = Buffer.from(value.slice(i, i + 255), 'utf8')
    chunks.push(Buffer.from([part.length]), part)
  }
  return Buffer.concat(chunks)
}

/** RFC 6761: diese Namensräume gehören nie ins globale DNS. */
const RESERVED_TLDS = ['localhost', 'test', 'invalid']
function isReservedTld(name) {
  return RESERVED_TLDS.some(tld => name === tld || name.endsWith(`.${tld}`))
}

function aRdata(ip) {
  return Buffer.from(ip.split('.').map(Number))
}

/**
 * Starten. `zone` ist eine Karte `name → { a?: string[], txt?: string[] }`.
 * Alles, was dort nicht steht, wird an `upstream` weitergereicht.
 */
export async function startDnsStub({ zone, port = 5354, upstream = '1.1.1.1' }) {
  const socket = createSocket('udp4')
  const forwarder = createSocket('udp4')
  /** offene Weiterleitungen: eigene Id → Absender des Originals */
  const pending = new Map()
  let nextId = 1

  forwarder.on('message', (msg) => {
    const id = msg.readUInt16BE(0)
    const origin = pending.get(id)
    if (!origin) return
    pending.delete(id)
    const reply = Buffer.from(msg)
    reply.writeUInt16BE(origin.id, 0) // die ursprüngliche Id zurückschreiben
    socket.send(reply, origin.port, origin.address)
  })

  socket.on('message', (msg, rinfo) => {
    const { name, offset } = readName(msg, 12)
    const type = msg.readUInt16BE(offset)
    const entry = zone[name]

    if (!entry && isReservedTld(name)) {
      /**
       * RESERVIERTE TLD, die wir nicht selbst besitzen → sofort „gibt es
       * nicht" (RFC 6761: `.localhost`, `.test` und `.invalid` dürfen die
       * Maschine gar nicht verlassen).
       *
       * OHNE DIESE ZEILE HING DER BEWEIS (2026-08-07): der Stub reichte
       * `eigen-xyz.localhost` an 1.1.1.1 weiter, das solche Namen einfach
       * VERWIRFT. Jede Abfrage lief in ihren vollen Timeout (2 Versuche × 4 s),
       * fünf Abfragen brauchten länger als die 15 s der Service-Naht, und der
       * Prüf-Klick endete in einem 503. Vorher fiel das nicht auf, weil ohne
       * Stub ZWEI Resolver konfiguriert waren und c-ares auf den zweiten
       * auswich.
       */
      socket.send(
        Buffer.concat([answerHeader(msg, 0, 3), msg.subarray(12, offset + 4)]),
        rinfo.port,
        rinfo.address,
      )
      return
    }

    if (!entry) {
      // NICHT UNSER NAME → an einen echten Resolver weiterreichen. Das ist die
      // Zeile, die den Beweis ehrlich hält.
      const id = (nextId++ & 0xFFFF) || 1
      pending.set(id, { id: msg.readUInt16BE(0), port: rinfo.port, address: rinfo.address })
      const copy = Buffer.from(msg)
      copy.writeUInt16BE(id, 0)
      forwarder.send(copy, 53, upstream)
      setTimeout(() => pending.delete(id), 5000)
      return
    }

    const question = msg.subarray(12, offset + 4)
    let answers = []
    if (type === TYPE_TXT && entry.txt) answers = entry.txt.map(value => record(TYPE_TXT, txtRdata(value)))
    else if (type === TYPE_A && entry.a) answers = entry.a.map(ip => record(TYPE_A, aRdata(ip)))
    else if (type === TYPE_CNAME) answers = [] // bewusst NODATA
    socket.send(
      Buffer.concat([answerHeader(msg, answers.length), question, ...answers]),
      rinfo.port,
      rinfo.address,
    )
  })

  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve, reject) => {
    forwarder.once('error', reject)
    /**
     * OHNE ADRESSE, also 0.0.0.0 — und das ist kein Detail: an `127.0.0.1`
     * gebunden kommt kein Paket über die Loopback-Schnittstelle hinaus, und
     * JEDE Weiterleitung lief in ihren Timeout (2026-08-07 gemessen: 10–13 s
     * je Abfrage statt Millisekunden). Der Beweis wurde dadurch nicht falsch
     * grün, sondern rot — der Stub „besaß" die reservierten Namen und
     * verschluckte alle anderen.
     */
    forwarder.bind(0, resolve)
  })

  return {
    port,
    close: () => {
      socket.close()
      forwarder.close()
    },
  }
}
