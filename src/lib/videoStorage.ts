import { NOTE_STORE_NAME, openDatabase, VIDEO_STORE_NAME, waitForTransaction } from './indexedDb'

export type StoredVideoRecord = {
  id: string
  name: string
  title: string
  size: number
  type: string
  createdAt: number
  thumbnailDataUrl: string
  file: File
}

type SaveVideoOptions = {
  title?: string
  thumbnailDataUrl?: string
}

export async function saveVideoToGallery(file: File, options: SaveVideoOptions = {}): Promise<StoredVideoRecord> {
  const defaultTitle = file.name.replace(/\.[^.]+$/, '') || file.name
  const record: StoredVideoRecord = {
    id: createVideoId(),
    name: file.name,
    title: options.title?.trim() || defaultTitle,
    size: file.size,
    type: file.type || 'video/mp4',
    createdAt: Date.now(),
    thumbnailDataUrl: options.thumbnailDataUrl || '',
    file
  }

  const database = await openDatabase()
  const transaction = database.transaction(VIDEO_STORE_NAME, 'readwrite')

  transaction.objectStore(VIDEO_STORE_NAME).put(record)

  try {
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
  return record
}

function createVideoId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `video-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeStoredVideoRecord(result: unknown): StoredVideoRecord | null {
  if (!result || typeof result !== 'object') {
    return null
  }

  const candidate = result as {
    id?: unknown
    name?: unknown
    title?: unknown
    size?: unknown
    type?: unknown
    createdAt?: unknown
    thumbnailDataUrl?: unknown
    file?: unknown
  }

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null
  }

  const rawFile = candidate.file

  if (!(rawFile instanceof Blob)) {
    return null
  }

  const file = rawFile instanceof File
    ? rawFile
    : new File([rawFile], typeof candidate.name === 'string' ? candidate.name : 'uploaded-film.mp4', {
      type: rawFile.type || (typeof candidate.type === 'string' ? candidate.type : 'video/mp4')
    })

  const normalizedName = typeof candidate.name === 'string' && candidate.name.length > 0
    ? candidate.name
    : file.name
  const normalizedTitle = typeof candidate.title === 'string' && candidate.title.trim().length > 0
    ? candidate.title.trim()
    : normalizedName.replace(/\.[^.]+$/, '')

  const normalizedSize = typeof candidate.size === 'number'
    ? candidate.size
    : file.size

  const normalizedType = typeof candidate.type === 'string' && candidate.type.length > 0
    ? candidate.type
    : (file.type || 'video/mp4')

  const normalizedCreatedAt = typeof candidate.createdAt === 'number'
    ? candidate.createdAt
    : Date.now()
  const normalizedThumbnail = typeof candidate.thumbnailDataUrl === 'string'
    ? candidate.thumbnailDataUrl
    : ''

  return {
    id: candidate.id,
    name: normalizedName,
    title: normalizedTitle,
    size: normalizedSize,
    type: normalizedType,
    createdAt: normalizedCreatedAt,
    thumbnailDataUrl: normalizedThumbnail,
    file
  }
}

export async function listStoredVideos(): Promise<StoredVideoRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(VIDEO_STORE_NAME, 'readonly')
  const request = transaction.objectStore(VIDEO_STORE_NAME).getAll()

  try {
    const results = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () => reject(new Error('Unable to read saved videos.'))
    })

    await waitForTransaction(transaction)

    return results
      .map((result) => normalizeStoredVideoRecord(result))
      .filter((result): result is StoredVideoRecord => result !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    database.close()
  }
}

export async function getStoredVideoById(videoId: string): Promise<StoredVideoRecord | null> {
  const database = await openDatabase()
  const transaction = database.transaction(VIDEO_STORE_NAME, 'readonly')
  const request = transaction.objectStore(VIDEO_STORE_NAME).get(videoId)

  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Unable to read the selected video.'))
    })

    await waitForTransaction(transaction)
    return normalizeStoredVideoRecord(result)
  } finally {
    database.close()
  }
}

export async function removeStoredVideo(videoId: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction([VIDEO_STORE_NAME, NOTE_STORE_NAME], 'readwrite')
  const videoStore = transaction.objectStore(VIDEO_STORE_NAME)
  const noteStore = transaction.objectStore(NOTE_STORE_NAME)
  videoStore.delete(videoId)

  try {
    await deleteNotesForVideoInStore(noteStore, videoId)
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

function deleteNotesForVideoInStore(noteStore: IDBObjectStore, videoId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const index = noteStore.index('videoId')
    const request = index.openCursor(IDBKeyRange.only(videoId))

    request.onerror = () => {
      reject(new Error('Unable to remove notes for this video.'))
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

export async function updateStoredVideoTitle(videoId: string, title: string): Promise<StoredVideoRecord | null> {
  const trimmedTitle = title.trim()

  if (!trimmedTitle) {
    throw new Error('Title cannot be empty.')
  }

  const database = await openDatabase()
  const transaction = database.transaction(VIDEO_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(VIDEO_STORE_NAME)
  const request = store.get(videoId)

  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Unable to read the selected video.'))
    })

    const record = normalizeStoredVideoRecord(result)

    if (!record) {
      await waitForTransaction(transaction)
      return null
    }

    const updatedRecord: StoredVideoRecord = {
      ...record,
      title: trimmedTitle
    }

    store.put(updatedRecord)
    await waitForTransaction(transaction)
    return updatedRecord
  } finally {
    database.close()
  }
}

export async function updateStoredVideoThumbnail(
  videoId: string,
  thumbnailDataUrl: string
): Promise<StoredVideoRecord | null> {
  const database = await openDatabase()
  const transaction = database.transaction(VIDEO_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(VIDEO_STORE_NAME)
  const request = store.get(videoId)

  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Unable to read the selected video.'))
    })

    const record = normalizeStoredVideoRecord(result)

    if (!record) {
      await waitForTransaction(transaction)
      return null
    }

    const updatedRecord: StoredVideoRecord = {
      ...record,
      thumbnailDataUrl
    }

    store.put(updatedRecord)
    await waitForTransaction(transaction)
    return updatedRecord
  } finally {
    database.close()
  }
}
