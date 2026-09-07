import { useState } from 'react'

export function ContactPicker({
  people,
  personId,
  onChange,
}: {
  people: { id: number; name: string; street?: string }[]
  personId: number | null
  onChange: (id: number | null) => void
}) {
  const selected = people.find((p) => p.id === personId)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)

  const matches =
    query.trim().length === 0
      ? people.slice(0, 8)
      : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)

  function pick(p: { id: number; name: string } | null) {
    onChange(p?.id ?? null)
    setQuery(p?.name ?? '')
    setOpen(false)
  }

  return (
    <div className="combobox">
      <input
        placeholder="Search contacts…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (personId != null) onChange(null)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="combobox-list">
          <div className="combobox-option muted" onMouseDown={() => pick(null)}>
            — None —
          </div>
          {matches.map((p) => (
            <div key={p.id} className="combobox-option" onMouseDown={() => pick(p)}>
              {p.name}
              {p.street && <span className="muted"> · {p.street}</span>}
            </div>
          ))}
          {matches.length === 0 && <div className="combobox-option muted">No matches</div>}
        </div>
      )}
    </div>
  )
}
