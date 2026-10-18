import { useState } from 'react'
import { listFolders } from '../../../shared/collection-tree'
import type { HttpMethod } from '../../../shared/types'
import { requestNameFromUrl } from '../../../shared/request-name'
import { Button, Dialog, Input, Select } from '../../ui'
import { byName } from '../../state/slices/collections'
import { selectActiveCollection } from '../../state/selectors'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import './dialogs.css'

const TOP = '__top__'
const DEFAULT_NAME = 'Untitled request'

function initialName(d: { name: string; method: HttpMethod; url: string }): string {
  if (d.name !== DEFAULT_NAME) return d.name
  return d.url.trim() !== '' ? requestNameFromUrl(d.method, d.url) : DEFAULT_NAME
}

export function SaveDialog(): React.JSX.Element {
  const open = useWorkspace((s) => s.ui.saveDialogOpen)
  const store = useWorkspaceStore()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) store.getState().openSaveDialog(false)
      }}
      title="Save request"
    >
      {/* Dialog content unmounts on close, so the form state is fresh on every open. */}
      <SaveForm />
    </Dialog>
  )
}

function SaveForm(): React.JSX.Element {
  const store = useWorkspaceStore()
  const collections = useWorkspace((s) => s.collections)
  const [name, setName] = useState(() => initialName(store.getState().draft))
  const [collectionId, setCollectionId] = useState(() => {
    const s = store.getState()
    const sorted = [...s.collections].sort(byName)
    return selectActiveCollection(s)?.id ?? sorted[0]?.id ?? ''
  })
  const [folder, setFolder] = useState(TOP)
  const [newName, setNewName] = useState('My collection')
  const [saving, setSaving] = useState(false)
  const [gone, setGone] = useState(false)

  const sorted = [...collections].sort(byName)
  const collection = collections.find((c) => c.id === collectionId) ?? null
  const hasCollections = collections.length > 0
  const folders = collection ? listFolders(collection) : []
  const canSave = name.trim() !== '' && !saving && (hasCollections ? collection !== null : true)

  const close = (): void => store.getState().openSaveDialog(false)

  const submit = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setGone(false)
    let result: 'saved' | 'failed' | 'gone'
    try {
      let targetId = collectionId
      if (!hasCollections) {
        const created = await store.getState().createCollection(newName)
        if (!created) return
        targetId = created.id
        setCollectionId(created.id)
      }
      result = await store.getState().saveAs({
        collectionId: targetId,
        folderId: folder === TOP ? null : folder,
        name: name.trim()
      })
      if (result === 'gone') setGone(true)
    } finally {
      setSaving(false)
    }
    if (result === 'saved') close()
  }

  return (
    <form
      className="moss-form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="moss-field">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      {hasCollections ? (
        <>
          <div className="moss-field">
            Collection
            <Select
              aria-label="Collection"
              value={collectionId}
              onValueChange={(v) => {
                setCollectionId(v)
                setFolder(TOP)
              }}
              options={sorted.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div className="moss-field">
            Folder
            <Select
              aria-label="Folder"
              value={folder}
              onValueChange={setFolder}
              options={[
                { value: TOP, label: 'Top level' },
                ...folders.map((f) => ({ value: f.id, label: f.path }))
              ]}
            />
          </div>
        </>
      ) : (
        <label className="moss-field">
          New collection name
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
      )}
      {gone && (
        <p role="alert" className="moss-field-error">
          That collection or folder no longer exists. Pick another.
        </p>
      )}
      <div className="moss-dialog__footer">
        <Button variant="secondary" type="button" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!canSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
