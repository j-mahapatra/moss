// First: configures zod before any module parses with it.
import './zod-config'
import '@fontsource-variable/instrument-sans/wght.css'
import '@fontsource-variable/spline-sans-mono/wght.css'
import './ui/tokens.css'
import './ui/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createWorkspaceStore } from './state/workspace'
import { applyTheme } from './ui/theme'

const store = createWorkspaceStore(window.api)
// First paint uses the theme mirrored in localStorage (else the store's default 'system'), so a
// saved theme doesn't flash. Once settings load, or the theme changes, the store's value wins.
const theme = applyTheme(() => store.getState().theme)
let last = { theme: store.getState().theme, loaded: store.getState().loaded }
store.subscribe((s) => {
  if (s.theme === last.theme && s.loaded === last.loaded) return
  last = { theme: s.theme, loaded: s.loaded }
  theme.refresh()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>
)
