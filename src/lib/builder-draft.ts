// Persists a builder draft — settings AND the in-memory song — across the sign-up navigation, so an
// anonymous visitor who builds + previews, then signs up to export, lands back exactly where they
// were (no re-adding the song). IndexedDB, not localStorage, because it can hold the audio Blob.
const DB_NAME = 'ttls-builder'
const STORE = 'draft'
const KEY = 'current'

export interface BuilderDraft {
  settings: Record<string, unknown>
  audio: { blob: Blob; name: string; type: string } | null
  pending: 'save' | 'export'
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDraft(draft: BuilderDraft): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(draft, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* best-effort; the auth redirect still happens */ }
}

export async function loadDraft(): Promise<BuilderDraft | null> {
  try {
    const db = await openDb()
    const draft = await new Promise<BuilderDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const get = tx.objectStore(STORE).get(KEY)
      get.onsuccess = () => resolve((get.result as BuilderDraft) ?? null)
      get.onerror = () => reject(get.error)
    })
    db.close()
    // Ignore stale drafts (>1 day) so an abandoned one never resurfaces later.
    if (draft && Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) { await clearDraft(); return null }
    return draft
  } catch { return null }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch { /* ignore */ }
}
