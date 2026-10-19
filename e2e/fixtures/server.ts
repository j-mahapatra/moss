import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'

export interface ReceivedRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

export interface FixtureServer {
  port: number
  /** Every request that reached /echo, in arrival order. */
  received: ReceivedRequest[]
  /** Resolves when a /slow request arrives (the next one after this call). */
  slowReceived(): Promise<void>
  close(): Promise<void>
}

export async function startServer(opts: { greeting?: string } = {}): Promise<FixtureServer> {
  const sockets = new Set<Socket>()
  const slowWaiters: Array<() => void> = []
  const received: ReceivedRequest[] = []
  const server: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/hello') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ greeting: opts.greeting ?? 'hi' }))
      return
    }
    if (req.url === '/echo') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        received.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ method: req.method, body }))
      })
      return
    }
    if (req.url === '/slow') {
      // Never responds; the socket is destroyed in close().
      for (const wake of slowWaiters.splice(0)) wake()
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no server address')
  return {
    port: address.port,
    received,
    slowReceived: () => new Promise<void>((resolve) => slowWaiters.push(resolve)),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      })
  }
}
