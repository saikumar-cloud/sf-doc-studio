// Zips the CONTENTS of dist/ (manifest.json at the zip root, as the Chrome Web Store requires).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'

if (!existsSync('dist/manifest.json')) {
  console.error('dist/manifest.json not found. Run `npm run build` first.')
  process.exit(1)
}
const { version } = JSON.parse(readFileSync('dist/manifest.json', 'utf8'))
const out = `sf-doc-studio-${version}.zip`
rmSync(out, { force: true })

if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path dist\\* -DestinationPath ${out} -Force`], { stdio: 'inherit' })
} else {
  execFileSync('zip', ['-r', '-q', `../${out}`, '.', '-x', '.DS_Store'], { cwd: 'dist', stdio: 'inherit' })
}
console.log(`Created ${out} - upload this file to the Chrome Web Store.`)
