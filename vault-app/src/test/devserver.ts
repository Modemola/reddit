// Local stand-in for the Devvit host: serves public/ and runs the real server code
// against an in-memory Redis. For trying the client in a normal browser. Not deployed.
//   node --experimental-strip-types src/test/devserver.ts [port]
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {extname, join} from 'node:path'
import {
  type Context,
  media,
  reddit,
  redis,
  runWithContext,
} from '@devvit/web/server'
import {onReq} from '../server/server.ts'

const hashes = new Map<string, Map<string, string>>()
const zsets = new Map<string, Map<string, number>>()
const h = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!
const r = redis as unknown as Record<string, unknown>
r.hGetAll = async (k: string) => Object.fromEntries(h(k))
r.hSet = async (k: string, v: Record<string, string>) => {
  for (const [f, x] of Object.entries(v)) h(k).set(f, x)
  return 1
}
r.hSetNX = async (k: string, f: string, v: string) => {
  if (h(k).has(f)) return 0
  h(k).set(f, v)
  return 1
}
r.hIncrBy = async (k: string, f: string, n: number) => {
  const v = Number(h(k).get(f) ?? 0) + n
  h(k).set(f, String(v))
  return v
}
r.hLen = async (k: string) => h(k).size
r.zAdd = async (k: string, ...m: {member: string; score: number}[]) => {
  const z = zsets.get(k) ?? zsets.set(k, new Map()).get(k)!
  for (const x of m) z.set(x.member, x.score)
  return m.length
}
r.zRange = async (k: string) =>
  [...(zsets.get(k) ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([member, score]) => ({member, score}))
reddit.getCurrentUsername = async () => 'local_tester'
// Uploads and comments are kept in memory and listed at /local/comments.
const posted: unknown[] = []
media.upload = async opts => {
  posted.push({upload: opts.url.slice(0, 40), bytes: opts.url.length})
  return {mediaId: `m${posted.length}`, mediaUrl: opts.url}
}
reddit.submitComment = async opts => {
  const rt = (opts as {richtext?: {build?: () => string}}).richtext
  posted.push({
    ...opts,
    richtext: rt?.build ? JSON.parse(rt.build()) : undefined,
  })
  return {permalink: `/local/comment/${posted.length}`} as Awaited<
    ReturnType<typeof reddit.submitComment>
  >
}

const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}
const port = Number(process.argv[2] ?? 5178)
createServer(async (req, rsp) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/'
  if (path === '/local/comments') {
    rsp.writeHead(200, {'Content-Type': 'application/json'})
    rsp.end(JSON.stringify(posted))
    return
  }
  if (path.startsWith('/api/')) {
    const user = String(req.headers['x-test-user'] ?? 't2_local')
    await runWithContext(
      {
        appName: 'vault-heist',
        postId: 't3_local',
        userId: user,
        username: user,
      } as unknown as Context,
      () => onReq(req, rsp),
    )
    return
  }
  try {
    const file = await readFile(
      join('public', path === '/' ? 'game.html' : path),
    )
    rsp.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
    })
    rsp.end(file)
  } catch {
    rsp.writeHead(404)
    rsp.end('not found')
  }
}).listen(port, () => console.log(`http://localhost:${port}`))
