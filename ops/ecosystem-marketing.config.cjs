// Zero-Downtime-Deploy (A.10-Muster, s. ecosystem-comments.config.cjs):
// pm2-Cluster fuer pukalani.app (Landingpage, apps/marketing) auf Port 3005;
// Script zeigt auf den current-Symlink, die Server-.env wird beim (Re-)Load
// geparst.
const fs = require('node:fs')

const ENV_FILE = '/home/ploi/pukalani.app/.env'
const CURRENT = '/home/ploi/releases/marketing/current'

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
      name: 'pukalaniapp',
      script: `${CURRENT}/server/index.mjs`,
      // cwd EXPLIZIT (3. pm2-Falle, 2026-07-26): ohne cwd friert pm2 das
      // Shell-cwd des ERSTSTARTS ein — s. ecosystem-portfolio.config.cjs.
      cwd: CURRENT,
      exec_mode: 'cluster',
      instances: 1,
      kill_timeout: 8000,
      env: {
        ...parseEnvFile(ENV_FILE),
        PORT: 3005,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
      },
    },
  ],
}
