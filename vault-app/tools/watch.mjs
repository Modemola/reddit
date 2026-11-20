// Rebuilds the client and server on every change. Works on Windows, macOS and Linux.
import {spawn} from 'node:child_process'

const run = script =>
  spawn('npm', ['run', script, '--', '--watch=forever'], {
    stdio: 'inherit',
    shell: true,
  })
const kids = [run('build:client'), run('build:server')]
const stop = () => {
  for (const k of kids) k.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
