import { CLIP_STORE_NAME, openDatabase, waitForTransaction } from './indexedDb'

export type StoredVideoClip = {
  id: string
  videoId: string
  durationSeconds: number
  size: number
  type: string
  createdAt: number
  blob: Blob
}

type SaveVideoClipInput = {
  videoId: string
  durationSeconds: number
  blob: Blob
}

function createClipId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function requestResult<T>(request: IDBRequest<T>, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(errorMessage))
  })
}

function normalizeStoredVideoClip(value: unknown): StoredVideoClip | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as {
    id?: unknown
    videoId?: unknown
    durationSeconds?: unknown
    size?: unknown
    type?: unknown
    createdAt?: unknown
    blob?: unknown
  }

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null
  }
  if (typeof candidate.videoId !== 'string' || candidate.videoId.length === 0) {
    return null
  }
  if (typeof candidate.durationSeconds !== 'number' || !Number.isFinite(candidate.durationSeconds) || candidate.durationSeconds < 0) {
    return null
  }
  if (!(candidate.blob instanceof Blob)) {
    return null
  }

  return {
    id: candidate.id,
    videoId: candidate.videoId,
    durationSeconds: candidate.durationSeconds,
    size: typeof candidate.size === 'number' ? candidate.size : candidate.blob.size,
    type: typeof candidate.type === 'string' && candidate.type.length > 0
      ? candidate.type
      : (candidate.blob.type || 'video/webm'),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    blob: candidate.blob
  }
}

export async function saveVideoClip(input: SaveVideoClipInput): Promise<StoredVideoClip> {
  if (!input.videoId) {
    throw new Error('A video ID is required to save a clip.')
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) {
    throw new Error('Clip duration must be zero or greater.')
  }

  const clip: StoredVideoClip = {
    id: createClipId(),
    videoId: input.videoId,
    durationSeconds: input.durationSeconds,
    size: input.blob.size,
    type: input.blob.type || 'video/webm',
    createdAt: Date.now(),
    blob: input.blob
  }

  const database = await openDatabase()
  const transaction = database.transaction(CLIP_STORE_NAME, 'readwrite')
  transaction.objectStore(CLIP_STORE_NAME).put(clip)

  try {
    await waitForTransaction(transaction)
    return clip
  } finally {
    database.close()
  }
}

export async function getVideoClipById(clipId: string): Promise<StoredVideoClip | null> {
  const database = await openDatabase()
  const transaction = database.transaction(CLIP_STORE_NAME, 'readonly')
  const request = transaction.objectStore(CLIP_STORE_NAME).get(clipId)

  try {
    const value = await requestResult<unknown>(request, 'Unable to load this clip.')
    await waitForTransaction(transaction)
    return normalizeStoredVideoClip(value)
  } finally {
    database.close()
  }
}

export async function deleteVideoClip(clipId: string): Promise<void> {
  if (!clipId) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(CLIP_STORE_NAME, 'readwrite')
  transaction.objectStore(CLIP_STORE_NAME).delete(clipId)

  try {
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

export async function deleteClipsForVideo(videoId: string): Promise<void> {
  if (!videoId) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(CLIP_STORE_NAME, 'readwrite')
  const clipStore = transaction.objectStore(CLIP_STORE_NAME)
  const request = clipStore.index('videoId').openCursor(IDBKeyRange.only(videoId))

  try {
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(new Error('Unable to delete clips for this video.'))
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
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}
