// Utility-process entry: relays messages between the main process and the request executor.
import { createRunnerHandler } from './handler'
import type { ToRunner } from '../shared/runner-protocol'

const parentPort = process.parentPort
const handle = createRunnerHandler((m) => parentPort.postMessage(m))
parentPort.on('message', (e) => {
  void handle(e.data as ToRunner)
})
