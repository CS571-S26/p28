import { NOTE_STORE_NAME, openDatabase, waitForTransaction } from './indexedDb'

export type StoredVideoNote = {
  id: string
  videoId: string
  timestampSeconds: number
  text: string
  createdAt: number
}

type SaveVideoNoteInput = {
  videoId: string
  text: string
  timestampSeconds: number
}

type UpdateVideoNotePatch = {
  text?: string
  timestampSeconds?: number
}

function createNoteId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeStoredVideoNote(value: unknown): StoredVideoNote | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as {
    id?: unknown
    videoId?: unknown
    timestampSeconds?: unknown
    text?: unknown
    createdAt?: unknown
  }

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null
  }

  if (typeof candidate.videoId !== 'string' || candidate.videoId.length === 0) {
    return null
  }

  if (typeof candidate.timestampSeconds !== 'number' || Number.isNaN(candidate.timestampSeconds)) {
    return null
  }

  if (typeof candidate.text !== 'string' || candidate.text.trim().length === 0) {
    return null
  }

  return {
    id: candidate.id,
    videoId: candidate.videoId,
    timestampSeconds: candidate.timestampSeconds,
    text: candidate.text.trim(),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now()
  }
}

export async function saveVideoNote(input: SaveVideoNoteInput): Promise<StoredVideoNote> {
  const text = input.text.trim()

  if (!input.videoId) {
    throw new Error('A video ID is required to save a note.')
  }

  if (!text) {
    throw new Error('Note text cannot be empty.')
  }

  if (!Number.isFinite(input.timestampSeconds) || input.timestampSeconds < 0) {
    throw new Error('Note timestamp must be zero or greater.')
  }

  const note: StoredVideoNote = {
    id: createNoteId(),
    videoId: input.videoId,
    timestampSeconds: input.timestampSeconds,
    text,
    createdAt: Date.now()
  }

  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')

  transaction.objectStore(NOTE_STORE_NAME).put(note)

  try {
    await waitForTransaction(transaction)
    return note
  } finally {
    database.close()
  }
}

export async function listNotesForVideo(videoId: string): Promise<StoredVideoNote[]> {
  if (!videoId) {
    return []
  }

  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readonly')
  const store = transaction.objectStore(NOTE_STORE_NAME)
  const index = store.index('videoId')
  const request = index.getAll(videoId)

  try {
    const results = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () => reject(new Error('Unable to load saved notes.'))
    })

    await waitForTransaction(transaction)

    return results
      .map((value) => normalizeStoredVideoNote(value))
      .filter((note): note is StoredVideoNote => note !== null)
      .sort((a, b) => {
        if (a.timestampSeconds === b.timestampSeconds) {
          return a.createdAt - b.createdAt
        }
        return a.timestampSeconds - b.timestampSeconds
      })
  } finally {
    database.close()
  }
}

export async function updateVideoNote(noteId: string, patch: UpdateVideoNotePatch): Promise<StoredVideoNote | null> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(NOTE_STORE_NAME)
  const request = store.get(noteId)

  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Unable to load this note.'))
    })

    const existingNote = normalizeStoredVideoNote(result)

    if (!existingNote) {
      await waitForTransaction(transaction)
      return null
    }

    const hasTextUpdate = typeof patch.text !== 'undefined'
    const hasTimestampUpdate = typeof patch.timestampSeconds !== 'undefined'

    if (!hasTextUpdate && !hasTimestampUpdate) {
      await waitForTransaction(transaction)
      return existingNote
    }

    const nextText = hasTextUpdate ? patch.text?.trim() ?? '' : existingNote.text
    const nextTimestamp = hasTimestampUpdate ? patch.timestampSeconds ?? Number.NaN : existingNote.timestampSeconds

    if (!nextText) {
      throw new Error('Note text cannot be empty.')
    }

    if (!Number.isFinite(nextTimestamp) || nextTimestamp < 0) {
      throw new Error('Note timestamp must be zero or greater.')
    }

    const updatedNote: StoredVideoNote = {
      ...existingNote,
      text: nextText,
      timestampSeconds: nextTimestamp
    }

    store.put(updatedNote)
    await waitForTransaction(transaction)
    return updatedNote
  } finally {
    database.close()
  }
}

export async function deleteVideoNote(noteId: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')

  transaction.objectStore(NOTE_STORE_NAME).delete(noteId)

  try {
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

export async function deleteNotesForVideo(videoId: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')

  try {
    await deleteNotesForVideoFromStore(transaction.objectStore(NOTE_STORE_NAME), videoId)
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

function deleteNotesForVideoFromStore(store: IDBObjectStore, videoId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const index = store.index('videoId')
    const request = index.openCursor(IDBKeyRange.only(videoId))

    request.onerror = () => {
      reject(new Error('Unable to delete notes for this video.'))
    }

    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        resolve()
        return
      }

      cursor.delete()
      cursor.continue()
    }
  })
}
