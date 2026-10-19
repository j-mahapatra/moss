# Moss

Moss is a local-first desktop API client. Build a request, send it, and read the
response, with everything staying on your machine.

**Status:** early development. Requests can be built, sent and saved into collections and folders, with collection variables and environments, and every send is kept in a searchable history. Import/export is still to come.

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

## Collections

Save a request with Cmd/Ctrl+S into a collection, optionally inside a folder.
Collections are shown in the navigator on the left, where you can create,
rename, duplicate, delete and reorder collections, folders and requests.
Each collection can also hold variables; use `{{name}}` in a request to
substitute a value.

Everything is stored locally in the app's user-data folder, in a `collections`
directory with one JSON file per collection. If a file can't be read, Moss
moves it aside (renamed with a `.corrupt-<timestamp>.json` suffix), tells you,
and carries on with the rest.

## Environments

An environment is a named set of variables, such as `dev` and `prod`, that you
can switch between without editing your requests. Create and edit them from the
Environments item in the left rail, then pick the active one from the chip in
the top bar (or choose "No environment"). The active environment is
remembered across restarts.

When a request is sent, `{{name}}` is replaced using the active environment
first, then the request's collection variables. An environment value therefore
wins over a collection variable with the same name. Variable values are stored
in plain text on your machine, like everything else in v1, so don't keep secrets
you wouldn't keep in a regular file.

## History

Every request you send is recorded, whether it succeeds, fails or is
cancelled. An entry holds the request, the status and how long it took.
History stores each request as you authored it: `{{variables}}` are never
resolved into history, but anything typed directly into a request (a pasted
token, a basic-auth password, a form-data file path) is stored as typed.
Response bodies and headers are never stored.

Open the History item in the left rail to browse entries grouped by day,
filter them, click one to reopen it in the editor, save it to a collection, or
delete it. "Clear history" removes everything.

Moss keeps the most recent 500 entries. They live in the app's user-data
folder, in a single `history.jsonl` file with one JSON entry per line.

## Import & export

Moss reads two formats:

- **Collection v2.1 JSON** (the public Postman Collection format). Open the
  Import item in the left rail, then drop a file, choose one with "Open file…",
  or paste the JSON. Files up to 10 MB are accepted.
- **curl commands.** Paste one into the Import panel to open it as a new,
  unsaved request, or paste it straight into the URL bar to replace the current
  request's method, URL, headers, body and auth (its name and place in a
  collection are kept).

A collection is exported as Collection v2.1 JSON from its row menu in the
navigator ("Export…").

Anything Moss can't represent is left out and reported, never silently dropped:
scripts, examples, descriptions, folder-level auth and variables, unsupported
auth or body types, and curl options Moss doesn't use. The Import panel lists
each one under "Not carried over"; a curl paste in the URL bar shows them as a
single notice.

Every imported collection, folder and request gets a fresh id; ids in the
file are not reused.

Form-data file paths are never imported. A file field keeps its key and on/off
state, but you have to choose the file again before the request can be sent.
Otherwise opening a collection someone else wrote could make Send upload any
local file they named, such as an SSH key.

A collection survives export and import unchanged, with these exceptions:

- ids are regenerated;
- form-data file paths are cleared, as above;
- a raw body whose content type isn't JSON, XML, HTML, JavaScript or plain text,
  and that has no `Content-Type` header, comes back as `text/plain`.

## Architecture

```
 +-----------------+   typed IPC    +-----------------+   messages   +------------------+
 |    renderer     | <------------> |      main       | <----------> |      runner      |
 | React, sandboxed|  (17 channels) | validate, build |              | utilityProcess,  |
 | no Node access  |                | the request     |              | undici, HTTP I/O |
 +-----------------+                +-----------------+              +------------------+
```

- **renderer** holds the UI: URL bar, request editor and response viewer.
- **main** validates every IPC payload, prepares the request and supervises the runner.
- **runner** is an Electron utility process that performs the HTTP call with undici.

### Security model

The renderer runs with context isolation and the sandbox on, and with Node
integration off. It reaches the rest of the app only through a typed preload
script that exposes seventeen channels. Main validates every payload with zod before
acting on it. Network access happens in a separate utility process, never in
the renderer.

## Developer notes

`package.json` pins `@radix-ui/react-dismissable-layer` to 1.1.11 and
`@radix-ui/react-focus-scope` to 1.1.7 through `overrides`. This gives Dialog,
Menu, Popover and Select a single shared layer stack; without it a Popover
inside a modal Dialog can't be clicked. Overriding to 1.2.1 instead broke Esc
for nested dialogs. Remove the overrides once all four packages depend on the
same version. `src/renderer/ui/layering.test.tsx` guards this.

## Clean-room statement

Moss is an independent project. It contains no Postman code or assets and interoperates only via the public Postman Collection v2.1 format.

The test suite includes the official Collection v2.1 JSON schema
(`src/shared/import-export/__fixtures__/postman-collection-v2.1.0.schema.json`,
from the postmanlabs/schemas repository, Apache-2.0; see the `NOTICE.md` beside
it). It is a test fixture only and is not bundled into the app.
