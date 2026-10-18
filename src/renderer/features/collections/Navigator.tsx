import { useState } from 'react'
import { Button, IconButton } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import { PlusIcon } from '../shell/icons'
import { CollectionTree } from './CollectionTree'
import './Navigator.css'

export function Navigator(): React.JSX.Element {
  const loaded = useWorkspace((s) => s.loaded)
  const collections = useWorkspace((s) => s.collections)
  const create = useWorkspace((s) => s.createCollection)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const add = (): void => {
    void create('New collection').then((c) => {
      if (c) setRenamingId(c.id)
    })
  }
  return (
    <aside className="navigator" aria-label="Collections">
      <div className="navigator__header">
        <h2 className="navigator__title">Collections</h2>
        <IconButton label="New collection" onClick={add}>
          <PlusIcon />
        </IconButton>
      </div>
      <div className="navigator__body">
        {!loaded ? (
          <p className="navigator__quiet">Loading…</p>
        ) : collections.length === 0 ? (
          <div className="navigator__empty">
            <p className="navigator__quiet">No collections yet</p>
            <Button variant="secondary" size="sm" onClick={add}>
              Create collection
            </Button>
          </div>
        ) : (
          <CollectionTree renamingId={renamingId} onRenamingChange={setRenamingId} />
        )}
      </div>
    </aside>
  )
}
