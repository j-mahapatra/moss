import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
  type Extension
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  hoverTooltip,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { findVariables, type VariableScope } from '../../../shared/variables'
import { externalChange } from './cm-setup'

/** Feed the current variable scope and submit handler into the editor state. */
export const setScope = StateEffect.define<VariableScope>()
export const setSubmit = StateEffect.define<() => void>()

const scopeField = StateField.define<VariableScope>({
  create: () => new Map(),
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setScope)) return e.value
    return value
  }
})

const submitField = StateField.define<() => void>({
  create: () => () => undefined,
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setSubmit)) return e.value
    return value
  }
})

const resolved = Decoration.mark({ class: 'var-resolved' })
const unresolved = Decoration.mark({ class: 'var-unresolved' })

/** One line only: newlines in typed or pasted text are removed. */
const singleLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(externalChange)) return tr
  let multi = false
  tr.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
    if (inserted.lines > 1) multi = true
  })
  if (!multi) return tr
  const specs: { from: number; to: number; insert: string }[] = []
  tr.changes.iterChanges((from, to, _fb, _tb, inserted) => {
    specs.push({ from, to, insert: inserted.toString().replace(/\r?\n/g, '') })
  })
  const only = specs.length === 1 ? specs[0] : undefined
  return {
    changes: specs,
    selection: only ? { anchor: only.from + only.insert.length } : undefined,
    userEvent: tr.annotation(Transaction.userEvent),
    scrollIntoView: true
  }
})

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const scope = view.state.field(scopeField)
  for (const v of findVariables(view.state.doc.toString())) {
    builder.add(v.start, v.end, scope.has(v.name) ? resolved : unresolved)
  }
  return builder.finish()
}

const variableMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(setScope)))) {
        this.decorations = buildDecorations(u.view)
      }
    }
  },
  { decorations: (p) => p.decorations }
)

const variableTooltip = hoverTooltip((view, pos) => {
  const hit = findVariables(view.state.doc.toString()).find((v) => pos >= v.start && pos <= v.end)
  if (!hit) return null
  const value = view.state.field(scopeField).get(hit.name)
  return {
    pos: hit.start,
    end: hit.end,
    above: true,
    create() {
      const dom = document.createElement('div')
      dom.className = 'moss-var-tip'
      dom.textContent = value === undefined ? 'Not defined' : value
      return { dom }
    }
  }
})

export const urlExtensions: Extension[] = [
  scopeField,
  submitField,
  singleLine,
  EditorView.contentAttributes.of({ 'data-url-input': '', spellcheck: 'false' }),
  variableMarks,
  variableTooltip,
  Prec.highest(
    keymap.of([
      {
        key: 'Enter',
        run: (view) => {
          view.state.field(submitField)()
          return true
        }
      }
    ])
  )
]
