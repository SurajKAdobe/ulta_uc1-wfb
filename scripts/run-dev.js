// ponytail: `aio app dev`'s livereload server binds a hardcoded port (35729, no
// config override in aio-cli-plugin-app-dev) and crashes the whole process on
// EADDRINUSE if something else on the machine grabs it in the split second
// between predev's port-kill and this server starting. Retry a few times
// instead of hunting down whatever intermittently squats on that port.
const { spawnSync, execSync } = require('child_process')

const MAX_ATTEMPTS = 5

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const result = spawnSync('aio', ['app', 'dev'], { stdio: ['inherit', 'inherit', 'pipe'], shell: true, encoding: 'utf8' })
  const stderr = result.stderr || ''
  process.stderr.write(stderr)

  if (result.status === 0 || !stderr.includes('EADDRINUSE')) {
    process.exit(result.status ?? 1)
  }

  console.error(`\n[run-dev] EADDRINUSE crashed aio app dev (attempt ${attempt}/${MAX_ATTEMPTS}), clearing port and retrying...`)
  try {
    execSync('node scripts/kill-port.js 9080 35729', { stdio: 'inherit' })
  } catch {}
}

console.error(`[run-dev] gave up after ${MAX_ATTEMPTS} attempts`)
process.exit(1)
