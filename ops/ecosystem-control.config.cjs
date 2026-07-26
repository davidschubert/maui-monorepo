// Zero-Downtime-Deploy (A.10-Muster, s. ecosystem-comments.config.cjs):
// pm2-Cluster des Control Plane auf Port 3003; Script zeigt auf den
// current-Symlink, die Server-.env wird beim (Re-)Load geparst.
//
// SERVER-PFADE TRAGEN NOCH DEN ALTNAMEN: die ploi-Site heißt weiterhin
// studio.pukalani.app (control.* haengt als Alias daran und antwortet). Diese
// Konstanten sind die WAHRHEIT ueber die Maschine, nicht ueber die Anwendung —
// sie umzubenennen, bevor das Verzeichnis umgezogen ist, wuerde den naechsten
// pm2-Reload ins Leere laufen lassen. Sie wandern beim ploi-Cutover mit.
const fs = require('node:fs')

const ENV_FILE = '/home/ploi/studio.pukalani.app/.env'
const CURRENT = '/home/ploi/releases/studio/current'

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
      name: 'controlpukalaniapp',
      script: `${CURRENT}/server/index.mjs`,
      exec_mode: 'cluster',
      instances: 1,
      kill_timeout: 8000,
      env: {
        ...parseEnvFile(ENV_FILE),
        PORT: 3003,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
      },
    },
  ],
}
