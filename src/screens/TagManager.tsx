import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import {
  TAG_COLOR_PALETTE,
  createTagCatalogEntry,
  listTagCatalogEntries,
  type StoredTagCatalogEntry
} from '../lib/noteStorage'
import TagCreationFields from '../components/TagCreationFields'

function sortTagsByName(tags: StoredTagCatalogEntry[]): StoredTagCatalogEntry[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function TagManager() {
  const [tags, setTags] = useState<StoredTagCatalogEntry[]>([])
  const [tagName, setTagName] = useState('')
  const [selectedColor, setSelectedColor] = useState<(typeof TAG_COLOR_PALETTE)[number]>(TAG_COLOR_PALETTE[0])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadTags() {
      try {
        const storedTags = await listTagCatalogEntries()
        if (!isCancelled) {
          setTags(sortTagsByName(storedTags))
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load global tags.'
          setErrorMessage(message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadTags()

    return () => {
      isCancelled = true
    }
  }, [])

  const previewLabel = useMemo(() => {
    const trimmedName = tagName.trim()
    return trimmedName.length > 0 ? trimmedName : 'Tag preview'
  }, [tagName])

  const isCreateDisabled = tagName.trim().length === 0 || isSaving

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreateDisabled) {
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const createdTag = await createTagCatalogEntry({
        name: tagName.trim(),
        color: selectedColor
      })
      setTags((previousTags) => sortTagsByName([...previousTags, createdTag]))
      setTagName('')
      setSuccessMessage(`Created "${createdTag.name}" global tag.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create this tag.'
      setErrorMessage(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="container-fluid px-3 px-xl-4 py-5 grow">
      <section className="row justify-content-center">
        <div className="col-12 col-xl-10 col-xxl-8">
          <div className="rounded-4 border bg-white p-4 p-lg-5 shadow-sm d-flex flex-column gap-4">
            <div>
              <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
              <h1 className="mb-2 text-3xl font-semibold text-slate-900">Global tags</h1>
              <p className="mb-0 text-slate-600">
                Create reusable tags for event notes and quick tagged moments.
              </p>
            </div>

            <section className="rounded-4 border p-3 p-lg-4">
              <h2 className="h5 mb-3 text-slate-900">Add global tag</h2>
              <form className="d-flex flex-column gap-3" onSubmit={(event) => { void handleSubmit(event) }}>
                <TagCreationFields
                  nameInputId="global-tag-name"
                  tagName={tagName}
                  selectedColor={selectedColor}
                  previewLabel={previewLabel}
                  onTagNameChange={setTagName}
                  onColorChange={setSelectedColor}
                />

                <div className="d-flex justify-content-end">
                  <button type="submit" className="btn btn-primary" disabled={isCreateDisabled}>
                    {isSaving ? 'Creating tag...' : 'Create global tag'}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-4 border p-3 p-lg-4">
              <h2 className="h5 mb-3 text-slate-900">Existing global tags</h2>
              {isLoading ? (
                <p className="mb-0 text-slate-600">Loading tags...</p>
              ) : tags.length === 0 ? (
                <p className="mb-0 text-slate-600">No global tags yet.</p>
              ) : (
                <div className="d-flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag.key}
                      className="d-inline-flex align-items-center px-3 py-2 rounded-pill border"
                      style={{ backgroundColor: tag.color, color: '#111111' }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {errorMessage ? (
              <div className="alert alert-danger mb-0" role="alert">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="alert alert-success mb-0" role="alert">
                {successMessage}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default TagManager
