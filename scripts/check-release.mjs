// Pre-publish checks: run after `npm run build` (npm run release:check does both).
import { readFileSync, existsSync, statSync } from 'node:fs'

const problems = []
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))

if (!/^\d+$/.test(String(manifest.id || ''))) problems.push('manifest.json: "id" is missing or not numeric')
if (manifest.documentAccess !== 'dynamic-page') problems.push('manifest.json: "documentAccess" must be "dynamic-page"')
for (const key of ['main', 'ui']) {
  const file = manifest[key]
  if (!file || !existsSync(file)) problems.push(`manifest.json: "${key}" points to a missing file (${file}); run npm run build`)
}

// The UI must not load scripts or styles from hosts the manifest doesn't allow
if (manifest.ui && existsSync(manifest.ui)) {
  const html = readFileSync(manifest.ui, 'utf8')
  const allowed = (manifest.networkAccess?.allowedDomains || []).map(d => d.replace(/\/$/, ''))
  const hosts = new Set([...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:\/\/[^/"]+)/g)].map(m => m[1]))
  for (const host of hosts) if (!allowed.includes(host)) problems.push(`${manifest.ui}: loads ${host}, which networkAccess.allowedDomains doesn't include`)
  const kb = Math.round(statSync(manifest.ui).size / 1024)
  console.log(`UI bundle: ${manifest.ui} (${kb} KB)`)
}

for (const asset of ['docs/publishing/icon.png', 'docs/publishing/cover.png']) {
  if (!existsSync(asset)) problems.push(`missing publishing asset: ${asset}`)
}

if (problems.length) {
  console.error('\nNot ready to publish:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log(`Ready to publish "${manifest.name}" (id ${manifest.id}).`)
