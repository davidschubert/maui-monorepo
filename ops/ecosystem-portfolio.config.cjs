// Zero-Downtime-Deploy (A.10-Muster, s. ecosystem-comments.config.cjs):
// pm2-Cluster fuer portfolio.pukalani.app auf Port 3002; Script zeigt auf den
// current-Symlink, die Server-.env wird beim (Re-)Load geparst.
const fs = require('node:fs')

const ENV_FILE = '/home/ploi/portfolio.pukalani.app/.env'
const CURRENT = '/home/ploi/releases/portfolio/current'

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
      name: 'portfoliopukalaniapp',
      script: `${CURRENT}/server/index.mjs`,
      // cwd EXPLIZIT (3. pm2-Falle, 2026-07-26): ohne cwd friert pm2 das
      // Shell-cwd des ERSTSTARTS ein — als das Verzeichnis der alten
      // studio-Site geloescht wurde, konnte pm2 portfolio nicht mehr
      // spawnen (ENOENT, errored, Site down). CURRENT existiert, solange
      // es die App gibt.
      cwd: CURRENT,
      exec_mode: 'cluster',
      instances: 1,
      kill_timeout: 8000,
      env: {
        ...parseEnvFile(ENV_FILE),
        PORT: 3002,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
      },
    },
  ],
}
