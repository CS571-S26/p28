import {
  NOTE_STORE_NAME,
  openDatabase,
  TAG_CATALOG_STORE_NAME,
  waitForTransaction
} from './indexedDb'

export const TAG_COLOR_PALETTE = [
  '#FEE2E2',
  '#FFEDD5',
  '#FEF3C7',
  '#DCFCE7',
  '#DBEAFE',
  '#EDE9FE',
  '#FCE7F3',
  '#E0F2FE'
] as const

type TagColor = typeof TAG_COLOR_PALETTE[number]

export type StoredTagCatalogEntry = {
  key: string
  name: string
  color: TagColor
  createdAt: number
  updatedAt: number
}

export type StoredVideoEvent = {
  id: string
  videoId: string
  timestampSeconds: number
  text: string
  createdAt: number
  type: 'note' | 'tag'
  tagKeys: string[]
}

export type StoredVideoNote = StoredVideoEvent

export type TagMatchMode = 'and' | 'or'

type SaveNoteEventInput = {
  videoId: string
  text: string
  timestampSeconds: number
  tagKeys?: string[]
}

type SaveQuickTagEventInput = {
  videoId: string
  timestampSeconds: number
  tagKeys: string[]
}

type UpdateVideoEventPatch = {
  text?: string
  timestampSeconds?: number
  tagKeys?: string[]
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

type ListTaggedMomentsInput = {
  tagKeys: string[]
  matchMode?: TagMatchMode
  videoIds?: string[]
}

type CreateTagInput = {
  name: string
  color: TagColor
}

function requestResult<T>(request: IDBRequest<T>, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(errorMessage))
  })
}

function createEventId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeTagKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeTagName(value: string): string {
  return value.trim()
}

function isAllowedTagColor(value: string): value is TagColor {
  return TAG_COLOR_PALETTE.includes(value as TagColor)
}

function normalizeTagKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const uniqueKeys = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }
    const normalizedKey = normalizeTagKey(item)
    if (normalizedKey) {
      uniqueKeys.add(normalizedKey)
    }
  }
  return [...uniqueKeys]
}

function sortEventsByTimestamp(events: StoredVideoEvent[]): StoredVideoEvent[] {
  return [...events].sort((a, b) => {
    if (a.timestampSeconds === b.timestampSeconds) {
      return a.createdAt - b.createdAt
    }
    return a.timestampSeconds - b.timestampSeconds
  })
}

function normalizeStoredTagCatalogEntry(value: unknown): StoredTagCatalogEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as {
    key?: unknown
    name?: unknown
    color?: unknown
    createdAt?: unknown
    updatedAt?: unknown
  }

  if (typeof candidate.key !== 'string' || !normalizeTagKey(candidate.key)) {
    return null
  }

  if (typeof candidate.name !== 'string' || !normalizeTagName(candidate.name)) {
    return null
  }

  if (typeof candidate.color !== 'string' || !isAllowedTagColor(candidate.color)) {
    return null
  }

  const now = Date.now()
  return {
    key: normalizeTagKey(candidate.key),
    name: normalizeTagName(candidate.name),
    color: candidate.color,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now
  }
}

function normalizeStoredVideoEvent(value: unknown): StoredVideoEvent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as {
    id?: unknown
    videoId?: unknown
    timestampSeconds?: unknown
    text?: unknown
    createdAt?: unknown
    type?: unknown
    tagKeys?: unknown
    tags?: unknown
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

  const hasExplicitType = candidate.type === 'note' || candidate.type === 'tag'
  const eventType: 'note' | 'tag' = candidate.type === 'tag' ? 'tag' : 'note'
  const normalizedText = typeof candidate.text === 'string' ? candidate.text.trim() : ''
  if (eventType === 'note' && normalizedText.length === 0) {
    return null
  }

  const tagKeys = hasExplicitType
    ? normalizeTagKeys(typeof candidate.tagKeys !== 'undefined' ? candidate.tagKeys : candidate.tags)
    : []

  return {
    id: candidate.id,
    videoId: candidate.videoId,
    timestampSeconds: candidate.timestampSeconds,
    text: normalizedText,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    type: eventType,
    tagKeys
  }
}

export async function listTagCatalogEntries(): Promise<StoredTagCatalogEntry[]> {
  const database = await openDatabase()
  const transaction = database.transaction(TAG_CATALOG_STORE_NAME, 'readonly')
  const request = transaction.objectStore(TAG_CATALOG_STORE_NAME).getAll()

  try {
    const results = await requestResult<unknown[]>(request, 'Unable to load tags.')
    await waitForTransaction(transaction)
    return results
      .map((value) => normalizeStoredTagCatalogEntry(value))
      .filter((entry): entry is StoredTagCatalogEntry => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  } finally {
    database.close()
  }
}

export async function createTagCatalogEntry(input: CreateTagInput): Promise<StoredTagCatalogEntry> {
  const name = normalizeTagName(input.name)
  if (!name) {
    throw new Error('Tag name cannot be empty.')
  }

  if (!isAllowedTagColor(input.color)) {
    throw new Error('Choose a valid tag color.')
  }

  const key = normalizeTagKey(name)
  const now = Date.now()
  const entry: StoredTagCatalogEntry = {
    key,
    name,
    color: input.color,
    createdAt: now,
    updatedAt: now
  }

  const database = await openDatabase()
  const transaction = database.transaction(TAG_CATALOG_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(TAG_CATALOG_STORE_NAME)

  try {
    const existingValue = await requestResult<unknown>(store.get(key), 'Unable to verify tag uniqueness.')
    if (normalizeStoredTagCatalogEntry(existingValue)) {
      throw new Error('A tag with this name already exists.')
    }

    store.put(entry)
    await waitForTransaction(transaction)
    return entry
  } finally {
    database.close()
  }
}

function replaceTagKeyInStore(
  noteStore: IDBObjectStore,
  currentKey: string,
  nextKey: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = noteStore.openCursor()

    request.onerror = () => reject(new Error('Unable to update event tags.'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }

      const event = normalizeStoredVideoEvent(cursor.value)
      if (!event) {
        cursor.delete()
        cursor.continue()
        return
      }

      if (!event.tagKeys.includes(currentKey)) {
        cursor.continue()
        return
      }

      const replacedTagKeys = event.tagKeys.map((tagKey) => (tagKey === currentKey ? nextKey : tagKey))
      const dedupedTagKeys = [...new Set(replacedTagKeys)]
      cursor.update({
        ...event,
        tagKeys: dedupedTagKeys
      })
      cursor.continue()
    }
  })
}

export async function renameTagCatalogEntry(tagKey: string, nextName: string): Promise<StoredTagCatalogEntry | null> {
  const normalizedCurrentKey = normalizeTagKey(tagKey)
  if (!normalizedCurrentKey) {
    return null
  }

  const normalizedName = normalizeTagName(nextName)
  if (!normalizedName) {
    throw new Error('Tag name cannot be empty.')
  }

  const normalizedNextKey = normalizeTagKey(normalizedName)

  const database = await openDatabase()
  const transaction = database.transaction([TAG_CATALOG_STORE_NAME, NOTE_STORE_NAME], 'readwrite')
  const tagStore = transaction.objectStore(TAG_CATALOG_STORE_NAME)
  const eventStore = transaction.objectStore(NOTE_STORE_NAME)

  try {
    const existingValue = await requestResult<unknown>(
      tagStore.get(normalizedCurrentKey),
      'Unable to load this tag.'
    )
    const existingEntry = normalizeStoredTagCatalogEntry(existingValue)
    if (!existingEntry) {
      await waitForTransaction(transaction)
      return null
    }

    if (normalizedCurrentKey !== normalizedNextKey) {
      const conflictValue = await requestResult<unknown>(
        tagStore.get(normalizedNextKey),
        'Unable to verify tag uniqueness.'
      )
      if (normalizeStoredTagCatalogEntry(conflictValue)) {
        throw new Error('A tag with this name already exists.')
      }
    }

    const updatedEntry: StoredTagCatalogEntry = {
      ...existingEntry,
      key: normalizedNextKey,
      name: normalizedName,
      updatedAt: Date.now()
    }

    if (normalizedCurrentKey !== normalizedNextKey) {
      tagStore.delete(normalizedCurrentKey)
    }
    tagStore.put(updatedEntry)

    if (normalizedCurrentKey !== normalizedNextKey) {
      await replaceTagKeyInStore(eventStore, normalizedCurrentKey, normalizedNextKey)
    }

    await waitForTransaction(transaction)
    return updatedEntry
  } finally {
    database.close()
  }
}

function removeTagFromEventsStore(noteStore: IDBObjectStore, tagKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = noteStore.openCursor()

    request.onerror = () => reject(new Error('Unable to update tagged events.'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }

      const event = normalizeStoredVideoEvent(cursor.value)
      if (!event) {
        cursor.delete()
        cursor.continue()
        return
      }

      if (!event.tagKeys.includes(tagKey)) {
        cursor.continue()
        return
      }

      const nextTagKeys = event.tagKeys.filter((existingTagKey) => existingTagKey !== tagKey)
      if (event.type === 'tag' && nextTagKeys.length === 0) {
        cursor.delete()
      } else {
        cursor.update({
          ...event,
          tagKeys: nextTagKeys
        })
      }
      cursor.continue()
    }
  })
}

export async function deleteTagCatalogEntry(tagKey: string): Promise<void> {
  const normalizedTagKey = normalizeTagKey(tagKey)
  if (!normalizedTagKey) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction([TAG_CATALOG_STORE_NAME, NOTE_STORE_NAME], 'readwrite')
  const tagStore = transaction.objectStore(TAG_CATALOG_STORE_NAME)
  const eventStore = transaction.objectStore(NOTE_STORE_NAME)

  tagStore.delete(normalizedTagKey)

  try {
    await removeTagFromEventsStore(eventStore, normalizedTagKey)
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

export async function saveNoteEvent(input: SaveNoteEventInput): Promise<StoredVideoEvent> {
  const text = input.text.trim()
  if (!input.videoId) {
    throw new Error('A video ID is required to save an event.')
  }
  if (!text) {
    throw new Error('Event text cannot be empty.')
  }
  if (!Number.isFinite(input.timestampSeconds) || input.timestampSeconds < 0) {
    throw new Error('Event timestamp must be zero or greater.')
  }

  const event: StoredVideoEvent = {
    id: createEventId(),
    videoId: input.videoId,
    timestampSeconds: input.timestampSeconds,
    text,
    createdAt: Date.now(),
    type: 'note',
    tagKeys: normalizeTagKeys(input.tagKeys)
  }

  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')
  transaction.objectStore(NOTE_STORE_NAME).put(event)

  try {
    await waitForTransaction(transaction)
    return event
  } finally {
    database.close()
  }
}

export async function saveQuickTagEvent(input: SaveQuickTagEventInput): Promise<StoredVideoEvent> {
  if (!input.videoId) {
    throw new Error('A video ID is required to save an event.')
  }
  if (!Number.isFinite(input.timestampSeconds) || input.timestampSeconds < 0) {
    throw new Error('Event timestamp must be zero or greater.')
  }

  const tagKeys = normalizeTagKeys(input.tagKeys)
  if (tagKeys.length === 0) {
    throw new Error('Choose at least one tag.')
  }

  const event: StoredVideoEvent = {
    id: createEventId(),
    videoId: input.videoId,
    timestampSeconds: input.timestampSeconds,
    text: '',
    createdAt: Date.now(),
    type: 'tag',
    tagKeys
  }

  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')
  transaction.objectStore(NOTE_STORE_NAME).put(event)

  try {
    await waitForTransaction(transaction)
    return event
  } finally {
    database.close()
  }
}

export async function listEventsForVideo(videoId: string): Promise<StoredVideoEvent[]> {
  if (!videoId) {
    return []
  }

  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readonly')
  const store = transaction.objectStore(NOTE_STORE_NAME)
  const request = store.index('videoId').getAll(videoId)

  try {
    const results = await requestResult<unknown[]>(request, 'Unable to load saved events.')
    await waitForTransaction(transaction)
    const normalizedEvents = results
      .map((value) => normalizeStoredVideoEvent(value))
      .filter((event): event is StoredVideoEvent => event !== null)
    return sortEventsByTimestamp(normalizedEvents)
  } finally {
    database.close()
  }
}

export async function listTaggedMoments(input: ListTaggedMomentsInput): Promise<StoredVideoEvent[]> {
  const selectedTagKeys = normalizeTagKeys(input.tagKeys)
  if (selectedTagKeys.length === 0) {
    return []
  }

  const selectedVideoIds = new Set(
    Array.isArray(input.videoIds)
      ? input.videoIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
  )
  const hasVideoScope = selectedVideoIds.size > 0
  const matchMode: TagMatchMode = input.matchMode === 'or' ? 'or' : 'and'

  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readonly')
  const request = transaction.objectStore(NOTE_STORE_NAME).getAll()

  try {
    const results = await requestResult<unknown[]>(request, 'Unable to load tagged events.')
    await waitForTransaction(transaction)

    const normalizedEvents = results
      .map((value) => normalizeStoredVideoEvent(value))
      .filter((event): event is StoredVideoEvent => event !== null)

    const filteredEvents = normalizedEvents.filter((event) => {
      if (event.tagKeys.length === 0) {
        return false
      }

      if (hasVideoScope && !selectedVideoIds.has(event.videoId)) {
        return false
      }

      return matchMode === 'or'
        ? selectedTagKeys.some((tagKey) => event.tagKeys.includes(tagKey))
        : selectedTagKeys.every((tagKey) => event.tagKeys.includes(tagKey))
    })

    return sortEventsByTimestamp(filteredEvents)
  } finally {
    database.close()
  }
}

export async function updateVideoEvent(
  eventId: string,
  patch: UpdateVideoEventPatch
): Promise<StoredVideoEvent | null> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(NOTE_STORE_NAME)

  try {
    const result = await requestResult<unknown>(store.get(eventId), 'Unable to load this event.')
    const existingEvent = normalizeStoredVideoEvent(result)
    if (!existingEvent) {
      await waitForTransaction(transaction)
      return null
    }

    const hasTextUpdate = typeof patch.text !== 'undefined'
    const hasTimestampUpdate = typeof patch.timestampSeconds !== 'undefined'
    const hasTagUpdate = typeof patch.tagKeys !== 'undefined'
    if (!hasTextUpdate && !hasTimestampUpdate && !hasTagUpdate) {
      await waitForTransaction(transaction)
      return existingEvent
    }

    const nextTimestamp = hasTimestampUpdate ? patch.timestampSeconds ?? Number.NaN : existingEvent.timestampSeconds
    if (!Number.isFinite(nextTimestamp) || nextTimestamp < 0) {
      throw new Error('Event timestamp must be zero or greater.')
    }

    const nextTagKeys = hasTagUpdate ? normalizeTagKeys(patch.tagKeys) : existingEvent.tagKeys

    const nextText = hasTextUpdate ? patch.text?.trim() ?? '' : existingEvent.text
    if (existingEvent.type === 'note' && !nextText) {
      throw new Error('Event text cannot be empty.')
    }

    if (existingEvent.type === 'tag' && nextTagKeys.length === 0) {
      store.delete(existingEvent.id)
      await waitForTransaction(transaction)
      return null
    }

    const updatedEvent: StoredVideoEvent = {
      ...existingEvent,
      timestampSeconds: nextTimestamp,
      text: existingEvent.type === 'tag' ? '' : nextText,
      tagKeys: nextTagKeys
    }

    store.put(updatedEvent)
    await waitForTransaction(transaction)
    return updatedEvent
  } finally {
    database.close()
  }
}

export async function deleteVideoEvent(eventId: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')
  transaction.objectStore(NOTE_STORE_NAME).delete(eventId)

  try {
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

export async function deleteEventsForVideo(videoId: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTE_STORE_NAME, 'readwrite')

  try {
    await deleteEventsForVideoFromStore(transaction.objectStore(NOTE_STORE_NAME), videoId)
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

function deleteEventsForVideoFromStore(store: IDBObjectStore, videoId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.index('videoId').openCursor(IDBKeyRange.only(videoId))

    request.onerror = () => reject(new Error('Unable to delete events for this video.'))
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

export async function saveVideoNote(input: SaveVideoNoteInput): Promise<StoredVideoNote> {
  return saveNoteEvent({
    videoId: input.videoId,
    text: input.text,
    timestampSeconds: input.timestampSeconds,
    tagKeys: []
  })
}

export async function listNotesForVideo(videoId: string): Promise<StoredVideoNote[]> {
  return listEventsForVideo(videoId)
}

export async function updateVideoNote(noteId: string, patch: UpdateVideoNotePatch): Promise<StoredVideoNote | null> {
  return updateVideoEvent(noteId, patch)
}

export async function deleteVideoNote(noteId: string): Promise<void> {
  return deleteVideoEvent(noteId)
}

export async function deleteNotesForVideo(videoId: string): Promise<void> {
  return deleteEventsForVideo(videoId)
}
