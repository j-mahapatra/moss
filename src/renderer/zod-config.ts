import { z } from 'zod'

// The renderer CSP has no 'unsafe-eval'. Without jitless, zod probes `new Function` and the
// browser reports a CSP violation even though zod catches the throw.
z.config({ jitless: true })
