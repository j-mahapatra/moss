/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newCollection, newFolder, toItem } from '../../../shared/collection-tree'
import { newRequestSpec, type Collection } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { Navigator } from './Navigator'

const req = (name: string) => toItem({ ...newRequestSpec(), name })

function seed() {
  const inner = req('Inner')
  const folder = { ...newFolder('Docs'), items: [inner] }
  const top = req('Top')
  const last = req('Last')
  const col: Collection = { ...newCollection('Alpha'), items: [folder, top, last] }
  return { col, folder, inner, top, last }
}

async function setup(cols: Collection[]) {
  const save = vi.fn(async () => undefined)
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(),
    ...noopExtras(),
    'collections:save': save,
    'collections:list': vi.fn(async () => ({ collections: cols, warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  render(
    <WorkspaceProvider store={store}>
      <Navigator />
    </WorkspaceProvider>
  )
  await act(async () => {
    await store.getState().init()
  })
  return { save, store, user: userEvent.setup() }
}

const row = (name: string) => screen.getByRole('treeitem', { name })
const names = () => screen.getAllByRole('treeitem').map((r) => r.getAttribute('aria-label'))

function makeDt() {
  const data: Record<string, string> = {}
  return {
    setData: (t: string, v: string) => {
      data[t] = v
    },
    getData: (t: string) => data[t] ?? '',
    get types() {
      return Object.keys(data)
    },
    dropEffect: 'none',
    effectAllowed: 'all'
  }
}

/** Mocks the row's box so offsetY (clientY - top) maps to a ratio of a 100px height. */
function aim(el: HTMLElement, ratio: number) {
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 100, right: 100, height: 100, width: 100, x: 0, y: 0 }) as DOMRect
  return { ratio }
}

/** jsdom has no DragEvent, so clientY is defined on the event by hand. */
function drag(kind: 'dragOver' | 'drop', el: HTMLElement, dt: unknown, pos: { ratio: number }) {
  const ev = createEvent[kind](el, { dataTransfer: dt })
  Object.defineProperty(ev, 'clientY', { value: pos.ratio * 100 })
  return fireEvent(el, ev)
}

const MIME = 'application/x-moss-item'

describe('CollectionTree drag and drop', () => {
  it('ignores a drag that starts inside the rename input', async () => {
    const { col } = seed()
    await setup([col])
    row('Top').focus()
    await userEvent.setup().keyboard('{F2}')
    const input = await screen.findByRole('textbox', { name: 'Rename' })
    const dt = makeDt()
    fireEvent.dragStart(input, { dataTransfer: dt })
    expect(dt.getData(MIME)).toBe('')
  })

  it('moves a request into a folder and saves the new structure', async () => {
    const { col, folder, top } = seed()
    const { save, store } = await setup([col])
    const dt = makeDt()
    fireEvent.dragStart(row('Top'), { dataTransfer: dt })
    expect(dt.getData(MIME)).toBe(JSON.stringify({ collectionId: col.id, itemId: top.id }))
    const target = row('Docs')
    drag('dragOver', target, dt, aim(target, 0.5))
    expect(target).toHaveClass('tree-row--drop-inside')
    drag('drop', target, dt, aim(target, 0.5))
    await act(async () => {})
    const saved = store.getState().collections[0]!
    expect(saved.items.map((i) => i.id)).not.toContain(top.id)
    const f = saved.items[0]
    expect(f?.kind === 'folder' && f.id === folder.id && f.items.map((i) => i.name)).toEqual([
      'Inner',
      'Top'
    ])
    expect(save).toHaveBeenCalledTimes(1)
    expect(target).not.toHaveClass('tree-row--drop-inside')
  })

  it('shows before/after indicators and reorders at the root', async () => {
    const { col } = seed()
    const { store } = await setup([col])
    const dt = makeDt()
    fireEvent.dragStart(row('Last'), { dataTransfer: dt })
    const target = row('Docs')
    drag('dragOver', target, dt, aim(target, 0.2))
    expect(target).toHaveClass('tree-row--drop-before')
    drag('dragOver', target, dt, aim(target, 0.8))
    expect(target).toHaveClass('tree-row--drop-after')
    drag('dragOver', target, dt, aim(target, 0.8))
    drag('drop', target, dt, aim(target, 0.8))
    await act(async () => {})
    expect(store.getState().collections[0]!.items.map((i) => i.name)).toEqual([
      'Docs',
      'Last',
      'Top'
    ])
  })

  it('appends to the collection root when dropping inside the collection row', async () => {
    const { col, inner } = seed()
    const { store, user } = await setup([col])
    await user.click(row('Docs'))
    const dt = makeDt()
    fireEvent.dragStart(row('Inner'), { dataTransfer: dt })
    const target = row('Alpha')
    drag('dragOver', target, dt, aim(target, 0.5))
    expect(target).toHaveClass('tree-row--drop-inside')
    drag('drop', target, dt, aim(target, 0.5))
    await act(async () => {})
    expect(store.getState().collections[0]!.items.at(-1)?.id).toBe(inner.id)
  })

  it('ignores drops from another collection and shows no indicator', async () => {
    const a = seed()
    const b = seed()
    const { save } = await setup([a.col, { ...b.col, name: 'Beta' }])
    const dt = makeDt()
    const foreign = screen.getAllByRole('treeitem', { name: 'Top' })[1]!
    const own = screen.getAllByRole('treeitem', { name: 'Docs' })[0]!
    fireEvent.dragStart(foreign, { dataTransfer: dt })
    const over = drag('dragOver', own, dt, aim(own, 0.5))
    expect(over).toBe(true) // not default-prevented: no-drop cursor
    expect(own.className).not.toMatch(/drop-/)
    drag('drop', own, dt, aim(own, 0.5))
    await act(async () => {})
    expect(save).not.toHaveBeenCalled()
  })

  it('ignores a drop with no payload or a malformed one', async () => {
    const { col } = seed()
    const { save } = await setup([col])
    const target = row('Docs')
    fireEvent.drop(target, { dataTransfer: makeDt(), ...aim(target, 0.5) })
    const bad = makeDt()
    bad.setData(MIME, '{nope')
    drag('drop', target, bad, aim(target, 0.5))
    await act(async () => {})
    expect(save).not.toHaveBeenCalled()
  })

  it('does not save or indicate when the drop resolves to the current position', async () => {
    const { col } = seed()
    const { save } = await setup([col])
    const dt = makeDt()
    fireEvent.dragStart(row('Docs'), { dataTransfer: dt })
    const target = row('Top')
    drag('dragOver', target, dt, aim(target, 0.2))
    expect(target.className).not.toMatch(/drop-/)
    drag('drop', target, dt, aim(target, 0.2))
    await act(async () => {})
    expect(save).not.toHaveBeenCalled()
  })

  it('clears the indicator on dragend and never drags collections or renaming rows', async () => {
    const { col } = seed()
    await setup([col])
    expect(row('Alpha')).toHaveAttribute('draggable', 'false')
    expect(row('Top')).toHaveAttribute('draggable', 'true')
    const dt = makeDt()
    fireEvent.dragStart(row('Last'), { dataTransfer: dt })
    const target = row('Top')
    drag('dragOver', target, dt, aim(target, 0.2))
    expect(target).toHaveClass('tree-row--drop-before')
    fireEvent.dragEnd(row('Last'), { dataTransfer: dt })
    expect(target.className).not.toMatch(/drop-/)
  })

  it('Alt+ArrowDown and Alt+ArrowUp reorder among siblings and keep focus', async () => {
    const { col } = seed()
    const { store, user } = await setup([col])
    row('Docs').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(store.getState().collections[0]!.items.map((i) => i.name)).toEqual([
      'Top',
      'Docs',
      'Last'
    ])
    expect(row('Docs')).toHaveFocus()
    await user.keyboard('{Alt>}{ArrowUp}{ArrowUp}{ArrowUp}{/Alt}')
    expect(store.getState().collections[0]!.items.map((i) => i.name)).toEqual([
      'Docs',
      'Top',
      'Last'
    ])
    expect(names()).toEqual(['Alpha', 'Docs', 'Top', 'Last'])
    expect(row('Docs')).toHaveFocus()
  })

  it('Alt+Arrow does nothing at the ends or on a collection', async () => {
    const { col } = seed()
    const { save, user } = await setup([col])
    row('Last').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    row('Alpha').focus()
    await user.keyboard('{Alt>}{ArrowDown}{ArrowUp}{/Alt}')
    expect(save).not.toHaveBeenCalled()
  })
})
