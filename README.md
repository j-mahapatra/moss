# Moss

Moss is a local-first desktop API client. Build a request, send it, and read the
response, with everything staying on your machine.

**Status:** v1. Moss builds and sends HTTP requests from an isolated runner
process, saves them into collections and folders, resolves `{{variables}}` from
environments and collection variables, and keeps a searchable history of every
send. It imports Postman Collection v2.1 files and curl commands and exports
collections back to v2.1. A command palette (⌘K) and a recent-requests
switcher (⌃Tab) cover navigation from the keyboard, and the theme follows the
OS or can be set to light or dark. macOS builds are packaged as an unsigned
`.dmg`.

![Moss (light)](assets/moss-light.png)

![Moss (dark)](assets/moss-dark.png)

## Quick start

```bash
npm install
npm run dev
```

## Scripts

| Script                | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | Start the app with hot reload                           |
| `npm run build`       | Typecheck, then build main, preload and renderer        |
| `npm run typecheck`   | Typecheck the node and web projects                     |
| `npm run lint`        | Run ESLint                                              |
| `npm test`            | Run the Vitest unit and component tests                 |
| `npm run e2e`         | Build the app and run the Playwright Electron tests     |
| `npm run gen:tokens`  | Regenerate `src/renderer/ui/tokens.css` from its source |
| `npm run gen:icon`    | Regenerate the app icons from `build/icon.svg`          |
| `npm run build:mac`   | Build the app and package an unsigned macOS `.dmg`      |
| `npm run screenshots` | Build the app and regenerate the README screenshots     |

## Command palette & shortcuts

On macOS the modifier is ⌘; on Windows and Linux it is Ctrl. The app shows the
right one for your system.

| macOS | Windows / Linux | Action                      |
| ----- | --------------- | --------------------------- |
| ⌘↵    | Ctrl+↵          | Send                        |
| ⌘S    | Ctrl+S          | Save                        |
| ⌘N    | Ctrl+N          | New request                 |
| ⌘K    | Ctrl+K          | Command palette             |
| ⌘B    | Ctrl+B          | Toggle navigator            |
| ⌘L    | Ctrl+L          | Focus URL                   |
| ⌃Tab  | Ctrl+Tab        | Recent requests             |
| Esc   | Esc             | Cancel an in-flight request |

**Command palette.** Press ⌘K (Ctrl+K on Windows and Linux), or click the
search field in the top bar. Type to filter, use the arrow keys to move and
Enter to run the highlighted item. The palette finds saved requests by name and
by their collection and folder path, switches the active environment (or turns
it off), and runs commands: New request, Import…, and the three theme commands.
Esc closes it and returns focus to wherever it was before. The same shortcut
again also closes it.

**Recent requests.** Moss remembers the last 10 saved requests you opened or
saved in this session, most recent first (unsaved drafts aren't listed, and the
list isn't kept across restarts). Hold Ctrl and press Tab to open the switcher
on the previous request; keep holding Ctrl and press Tab or Shift+Tab (or the
arrow keys) to move, then release Ctrl to open the selected one. Enter or a
click also opens it, and Esc closes the switcher without changing anything. A
quick Ctrl+Tab therefore flips between the two most recent requests.

**Theme.** Moss follows the system appearance by default. The palette
commands "Theme: Light" and "Theme: Dark" override it, and "Theme: Match
system" goes back to following the OS. The choice is saved in `settings.json`
and applies at once.

While the palette, the switcher or any other dialog or menu is open, the
global shortcuts above do nothing, and holding a key down never repeats a
send, save or new request.

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

Exported file fields keep only the file name, never the full local path.

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

## Packaging

`npm run build:mac` builds the app and packages it with electron-builder as an
unsigned `.dmg` in `dist/`. Because the app isn't signed or notarized,
Gatekeeper blocks a double-click on first launch: right-click Moss in
Applications and choose Open, then confirm. `npm run gen:icon` regenerates
`build/icon.png`, `build/icon.icns` and `resources/icon.png` from
`build/icon.svg` (it needs macOS for `iconutil`). The README screenshots in
`assets/` are regenerated with `npm run screenshots` and are not packaged.

## Developer notes

`package.json` pins `@radix-ui/react-dismissable-layer` to 1.1.11 and
`@radix-ui/react-focus-scope` to 1.1.7 through `overrides`. This gives Dialog,
Menu, Popover and Select a single shared layer stack; without it a Popover
inside a modal Dialog can't be clicked. Overriding to 1.2.1 instead broke Esc
for nested dialogs. Remove the overrides once all four packages depend on the
same version. `src/renderer/ui/layering.test.tsx` guards this.

## Clean-room statement

Moss is an independent project. It contains no Postman application code or assets and interoperates only via the public Postman Collection v2.1 format. The only Postman-authored file in the repository is the official Collection v2.1 JSON schema (`src/shared/import-export/__fixtures__/postman-collection-v2.1.0.schema.json`, Apache-2.0, from the postmanlabs/schemas repository; see the `NOTICE.md` beside it). The test suite uses it to validate exports, and it is not bundled into the app.
