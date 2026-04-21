const DB_NAME = 'film-reviewer-db'
const DB_VERSION = 3

export const VIDEO_STORE_NAME = 'video-gallery'
export const NOTE_STORE_NAME = 'video-notes'

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Unable to open browser storage.'))
    }

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(VIDEO_STORE_NAME)) {
        database.createObjectStore(VIDEO_STORE_NAME, { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains(NOTE_STORE_NAME)) {
        const noteStore = database.createObjectStore(NOTE_STORE_NAME, { keyPath: 'id' })
        noteStore.createIndex('videoId', 'videoId', { unique: false })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

export function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('Browser storage transaction failed.'))
    transaction.onabort = () => reject(new Error('Browser storage transaction was aborted.'))
  })
}
