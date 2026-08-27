// ponytail: kills whatever is squatting on the dev port before `aio app dev` starts.
// Windows Ctrl+C often leaves parcel worker processes holding the port, causing the
// next `npm run dev` to hang/fail to bind. No new dependency — just OS process tools.
const { execSync } = require('child_process')

const ports = process.argv.slice(2)
if (ports.length === 0) ports.push('9080')

for (const port of ports) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' })
      const pids = [...new Set(out.split('\n')
        .map(line => line.trim().split(/\s+/).pop())
        .filter(pid => pid && /^\d+$/.test(pid)))]
      pids.forEach(pid => {
        try {
          execSync(`taskkill /F /PID ${pid}`)
          console.log(`killed stale process on port ${port} (pid ${pid})`)
        } catch {}
      })
    } else {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { shell: '/bin/sh' })
    }
  } catch {
    // nothing was listening on this port — that's fine
  }
}
