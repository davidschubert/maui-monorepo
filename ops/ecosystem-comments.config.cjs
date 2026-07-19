// Zero-Downtime-Deploy Stufe 2 (PHASE-17 A.10, Server 1 / ploi):
// pm2-Ecosystem für comments.pukalani.app im CLUSTER-Mode (instances: 1).
// Nur der Cluster-Mode kann `pm2 reload` — der neue Worker startet, pm2
// wartet auf dessen 'listening', erst DANN stirbt der alte → kein 502.
// Der Fork-Mode-Vorgänger (bash start-prod.sh) konnte nur restart (= Lücke
// in Boot-Dauer) und baute .output IN-PLACE um, während der alte Prozess
// noch daraus servierte.
//
// Das Script zeigt auf den `current`-Symlink (Flip macht das ploi-Deploy-
// Script per ln + mv -Tf, atomar); der Worker löst den Link beim Fork auf —
// reload nach dem Flip lädt also den neuen Release-Stand.
//
// Env: Nitro liest zur Laufzeit KEINE .env — deshalb parst diese Config die
// Server-.env beim (Re-)Load und hebt sie in die Prozess-Umgebung
// (`pm2 startOrReload … --update-env` übernimmt Änderungen).
const fs = require('node:fs')

const ENV_FILE = '/home/ploi/comments.pukalani.app/.env'
const CURRENT = '/home/ploi/releases/comments/current'

function parseEnvFile(path) {
  const env = {}
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || match[1].startsWith('#')) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

module.exports = {
  apps: [
    {
      name: 'commentspukalaniapp',
      script: `${CURRENT}/server/index.mjs`,
      exec_mode: 'cluster',
      instances: 1,
      // Alter Worker bekommt nach dem Listening des neuen 8 s für offene
      // Requests, dann SIGKILL.
      kill_timeout: 8000,
      env: {
        ...parseEnvFile(ENV_FILE),
        PORT: 3001,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
      },
    },
  ],
}
