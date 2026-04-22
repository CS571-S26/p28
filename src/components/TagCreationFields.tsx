import type { RefObject } from 'react'
import { TAG_COLOR_PALETTE } from '../lib/noteStorage'

const TAG_COLOR_NAMES: Record<(typeof TAG_COLOR_PALETTE)[number], string> = {
  '#FEE2E2': 'Soft red',
  '#FFEDD5': 'Soft orange',
  '#FEF3C7': 'Soft yellow',
  '#DCFCE7': 'Soft green',
  '#DBEAFE': 'Soft blue',
  '#EDE9FE': 'Soft purple',
  '#FCE7F3': 'Soft pink',
  '#E0F2FE': 'Soft sky blue'
}

type TagCreationFieldsProps = {
  nameInputId: string
  nameInputRef?: RefObject<HTMLInputElement | null>
  tagName: string
  selectedColor: (typeof TAG_COLOR_PALETTE)[number]
  previewLabel: string
  onTagNameChange: (value: string) => void
  onColorChange: (color: (typeof TAG_COLOR_PALETTE)[number]) => void
}

function TagCreationFields({
  nameInputId,
  nameInputRef,
  tagName,
  selectedColor,
  previewLabel,
  onTagNameChange,
  onColorChange
}: TagCreationFieldsProps) {
  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <label htmlFor={nameInputId} className="form-label">Tag name</label>
        <input
          id={nameInputId}
          ref={nameInputRef}
          type="text"
          className="form-control"
          value={tagName}
          onChange={(event) => onTagNameChange(event.target.value)}
          placeholder="Example: Offensive point"
        />
      </div>
      <div>
        <p className="form-label mb-2">Choose a color</p>
        <div className="d-flex flex-wrap gap-2">
          {TAG_COLOR_PALETTE.map((color) => {
            const isSelected = selectedColor === color
            return (
              <button
                key={color}
                type="button"
                className={`btn btn-sm ${isSelected ? 'btn-dark' : 'btn-outline-secondary'}`}
                onClick={() => onColorChange(color)}
                aria-label={`Choose ${TAG_COLOR_NAMES[color]} tag color`}
                aria-pressed={isSelected}
              >
                <span
                  className="d-inline-block rounded-circle border border-secondary-subtle"
                  style={{ width: '1rem', height: '1rem', backgroundColor: color }}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="rounded-3 border p-3">
        <p className="mb-2 fw-semibold text-slate-900">Color preview</p>
        <span
          className="d-inline-flex align-items-center px-3 py-2 rounded-pill border"
          style={{ backgroundColor: selectedColor, color: '#111111' }}
        >
          {previewLabel}
        </span>
      </div>
    </div>
  )
}

export default TagCreationFields
