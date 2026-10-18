# Moss

Moss is a local-first desktop API client. Build a request, send it, and read the
response, with everything staying on your machine.

**Status:** early development. Only the request/response foundation exists so far.

## Quick start

```bash
npm install
npm run dev
```

## Scripts

| Script               | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `npm run dev`        | Start the app with hot reload                           |
| `npm run build`      | Typecheck, then build main, preload and renderer        |
| `npm run typecheck`  | Typecheck the node and web projects                     |
| `npm run lint`       | Run ESLint                                              |
| `npm test`           | Run the Vitest unit and component tests                 |
| `npm run e2e`        | Build the app and run the Playwright Electron tests     |
| `npm run gen:tokens` | Regenerate `src/renderer/ui/tokens.css` from its source |

## Architecture

```
 +-----------------+   typed IPC    +-----------------+   messages   +------------------+
 |    renderer     | <------------> |      main       | <----------> |      runner      |
 | React, sandboxed|  (4 channels)  | validate, build |              | utilityProcess,  |
 | no Node access  |                | the request     |              | undici, HTTP I/O |
 +-----------------+                +-----------------+              +------------------+
```

- **renderer** holds the UI: URL bar, request editor and response viewer.
- **main** validates every IPC payload, prepares the request and supervises the runner.
- **runner** is an Electron utility process that performs the HTTP call with undici.

### Security model

The renderer runs with context isolation and the sandbox on, and with Node
integration off. It reaches the rest of the app only through a typed preload
script that exposes four channels. Main validates every payload with zod before
acting on it. Network access happens in a separate utility process, never in
the renderer.

## Clean-room statement

Moss is an independent project. It contains no Postman code or assets and interoperates only via the public Postman Collection v2.1 format.
