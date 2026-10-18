import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'

export interface FixtureServer {
  port: number
  close(): Promise<void>
}

export async function startServer(): Promise<FixtureServer> {
  const sockets = new Set<Socket>()
  const server: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/hello') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ greeting: 'hi' }))
      return
    }
    if (req.url === '/slow') {
      // Never responds; the socket is destroyed in close().
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
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      })
  }
}
