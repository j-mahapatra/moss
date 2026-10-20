// Builds the macOS dmgs for distribution. Run with `npm run dist:mac`.
//
// Signing is opt-in through the environment:
// - Neither CSC_LINK nor CSC_NAME set: builds unsigned, exactly like `npm run build:mac`.
// - CSC_LINK (a .p12 path, URL or base64) or CSC_NAME (a Developer ID Application identity
//   in the login keychain) set: signs with hardened runtime and notarizes. That needs
//   notarization credentials, either APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
//   or APPLE_API_KEY (path to the .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER. If they are
//   incomplete the script exits 1 before building anything. After a signed build, every
//   dist/mac*/Moss.app is checked with codesign and spctl, and the script exits 1 if any check
//   fails, so a build that silently came out unsigned is caught here.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS: Node runs this file directly, so it can't carry type annotations */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const UNSIGNED_MESSAGE = 'No signing identity configured; building unsigned.'

const APPLE_ID_VARS = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
const API_KEY_VARS = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']

/**
 * Decides how to build from the environment. Pure, so it can be tested.
 * Returns { kind: 'unsigned' }, { kind: 'error', message } or
 * { kind: 'signed', builderArgs } (extra electron-builder arguments).
 */
export function planBuild(env) {
  const has = (name) => typeof env[name] === 'string' && env[name] !== ''
  if (!has('CSC_LINK') && !has('CSC_NAME')) return { kind: 'unsigned' }

  // Same precedence as electron-builder: once any Apple ID variable is set it uses that
  // method (and fails if it is incomplete), otherwise the API key method.
  const appleIdStarted = APPLE_ID_VARS.some(has)
  const apiKeyStarted = API_KEY_VARS.some(has)
  let missing = null
  if (appleIdStarted) {
    const absent = APPLE_ID_VARS.filter((name) => !has(name))
    if (absent.length > 0) missing = absent.join(', ')
  } else if (apiKeyStarted) {
    const absent = API_KEY_VARS.filter((name) => !has(name))
    if (absent.length > 0) missing = absent.join(', ')
  } else {
    missing = `${APPLE_ID_VARS.join(', ')} (or ${API_KEY_VARS.join(', ')})`
  }
  if (missing !== null) {
    const signer = has('CSC_NAME') ? 'CSC_NAME' : 'CSC_LINK'
    return {
      kind: 'error',
      message:
        `${signer} is set, so the build would be signed and notarized, but notarization ` +
        `credentials are incomplete. Missing: ${missing}. Set APPLE_ID, ` +
        `APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID, or APPLE_API_KEY, APPLE_API_KEY_ID ` +
        `and APPLE_API_ISSUER. Unset CSC_LINK and CSC_NAME to build unsigned.`
    }
  }

  // An empty identity overrides the config's `identity: null` and leaves electron-builder to
  // find the Developer ID Application certificate itself (the one CSC_LINK imports).
  const identity = has('CSC_NAME') ? env.CSC_NAME : ''
  return {
    kind: 'signed',
    builderArgs: [`-c.mac.identity=${identity}`, '-c.mac.notarize=true']
  }
}

/**
 * The built apps: `<distDir>/<dir>/Moss.app` for each `mac*` entry of `names` (mac, mac-arm64,
 * mac-universal, ...) where `exists` finds one. Pure apart from `exists`, so it can be tested.
 */
export function builtApps(distDir, names, exists) {
  return names
    .filter((name) => /^mac(-|$)/.test(name))
    .map((name) => join(distDir, name, 'Moss.app'))
    .filter((app) => exists(app))
}

/**
 * What to check after the build. Returns { kind: 'skip' } for an unsigned build,
 * { kind: 'error', message } for a signed build with no app, or { kind: 'verify', checks },
 * each check a { bin, args } command that must exit 0.
 */
export function planVerify(plan, apps) {
  if (plan.kind !== 'signed') return { kind: 'skip' }
  if (apps.length === 0) {
    return {
      kind: 'error',
      message: 'The signed build produced no Moss.app under dist/mac*, so it could not be verified.'
    }
  }
  return {
    kind: 'verify',
    checks: apps.flatMap((app) => [
      { bin: 'codesign', args: ['--verify', '--deep', '--strict', '--verbose=2', app] },
      { bin: 'spctl', args: ['-a', '-t', 'exec', '-vv', app] }
    ])
  }
}

/** The message for a failed check; `status` is its exit code. */
export function verifyFailure(check, status) {
  return (
    `Signature check failed (exit ${status}): ${check.bin} ${check.args.join(' ')}. ` +
    'The app is not signed or notarized as expected; do not ship it.'
  )
}

function verify(plan) {
  const distDir = resolve(import.meta.dirname, '..', 'dist')
  const names = existsSync(distDir) ? readdirSync(distDir) : []
  const checks = planVerify(plan, builtApps(distDir, names, existsSync))
  if (checks.kind === 'skip') return
  if (checks.kind === 'error') {
    console.error(checks.message)
    process.exit(1)
  }
  for (const check of checks.checks) {
    const result = spawnSync(check.bin, check.args, { stdio: 'inherit' })
    const status = result.error ? 'not run' : result.status
    if (status !== 0) {
      console.error(verifyFailure(check, status ?? 'signal'))
      process.exit(1)
    }
  }
}

function run(bin, args) {
  const root = resolve(import.meta.dirname, '..')
  const result = spawnSync(join(root, 'node_modules/.bin', bin), args, {
    cwd: root,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function main() {
  const plan = planBuild(process.env)
  if (plan.kind === 'error') {
    console.error(plan.message)
    process.exit(1)
  }
  if (plan.kind === 'unsigned') console.log(UNSIGNED_MESSAGE)
  run('electron-vite', ['build'])
  run('electron-builder', ['--mac', ...(plan.kind === 'signed' ? plan.builderArgs : [])])
  verify(plan)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
