export interface Session {
  id: string
  task: string
  history: unknown[]
  status: string
  createdAt: number
}

export type SessionRecord = Session

const DB_NAME = 'page-agent-ext'
const STORE_NAME = 'sessions'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function saveSession(session: Omit<Session, 'id' | 'createdAt'>): Promise<string> {
  const db = await openDB()
  const id = crypto.randomUUID()
  const newSession: Session = {
    ...session,
    id,
    createdAt: Date.now(),
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.add(newSession)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(id)

    tx.oncomplete = () => db.close()
  })
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    tx.oncomplete = () => db.close()
  })
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const sessions = (request.result as Session[]).sort((a, b) => b.createdAt - a.createdAt)
      resolve(sessions)
    }

    tx.oncomplete = () => db.close()
  })
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()

    tx.oncomplete = () => db.close()
  })
}

export async function listSessions(): Promise<SessionRecord[]> {
  return getAllSessions()
}

export async function clearSessions(): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()

    tx.oncomplete = () => db.close()
  })
}
