import type { AuxConfig } from './auxPioneering'

// S-205b-E ("Application for Auxiliary Pioneer Service") is a real fillable AcroForm —
// confirmed by inspecting it directly, not a flat page needing coordinate-overlay text.
// Field names, front to back: Text1 (month(s) of), Check Box1 (continuous), Text2 (date),
// Text3 (personal signature), Text4 (printed name), Text5-7 (elder committee — left blank,
// filled by the congregation, not this app).
const FORM_URL = `${import.meta.env.BASE_URL}S-205b_E form.pdf`

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "YYYY-M" -> "Month YYYY", matching auxPioneering.ts's `auxMonthKey` format. */
function monthKeyToLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_NAMES[month]} ${year}`
}

/** The exact text for the "The month(s) of ____" line, for whichever aux mode is active.
    'this-month' and 'continuous' each print their single stored month (continuous's is
    the month enrollment began, since the form always needs *a* month printed even for an
    open-ended enrollment); 'multiple-months' joins every selected month, in order. */
function monthsLineFor(cfg: AuxConfig): string {
  if (cfg.mode === 'multiple-months') {
    return [...cfg.months].sort().map(monthKeyToLabel).join(', ')
  }
  return cfg.months[0] ? monthKeyToLabel(cfg.months[0]) : ''
}

export interface AuxSlipName {
  firstName: string
  lastName: string
}

/** Fills the real S-205b-E AcroForm fields (no coordinate guessing — see field-name
    comment above) and flattens the result so the values render reliably in any PDF
    viewer the group overseer might open it in, not just ones that render form fields. */
export async function buildAuxSlipPdf(cfg: AuxConfig, name: AuxSlipName): Promise<Uint8Array> {
  // pdf-lib is a large dependency most sessions never touch (this feature is opt-in and
  // occasional) — loaded on demand here rather than in the app's main bundle, the same
  // reasoning App.tsx already applies to lazy-loading the Map tab's Leaflet dependency.
  const { PDFDocument, StandardFonts } = await import('pdf-lib')

  const res = await fetch(encodeURI(FORM_URL))
  if (!res.ok) throw new Error('Could not load the S-205b-E form template.')
  const templateBytes = await res.arrayBuffer()

  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()
  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique)

  const fullName = `${name.firstName} ${name.lastName}`.trim()
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  const monthsField = form.getTextField('Text1')
  monthsField.setText(monthsLineFor(cfg))
  monthsField.updateAppearances(helvetica)

  const continuousBox = form.getCheckBox('Check Box1')
  if (cfg.mode === 'continuous') continuousBox.check()
  else continuousBox.uncheck()

  const dateField = form.getTextField('Text2')
  dateField.setText(today)
  dateField.updateAppearances(helvetica)

  // A typed name stands in for a real signature (this app never captures handwriting) —
  // italic is the only practical way to distinguish it from the plain printed-name line.
  const signatureField = form.getTextField('Text3')
  signatureField.setText(fullName)
  signatureField.updateAppearances(helveticaOblique)

  const printedNameField = form.getTextField('Text4')
  printedNameField.setText(fullName)
  printedNameField.updateAppearances(helvetica)

  form.flatten()
  return doc.save()
}

/** Serialize and hand the filled slip to the user — mirrors backup.ts's exportBackup()
    exactly (native share sheet first, since on iOS especially an <a download> is
    unreliable, falling back to a normal download). */
export async function shareAuxSlipPdf(bytes: Uint8Array, filename: string): Promise<'shared' | 'downloaded'> {
  try {
    const file = new File([bytes as BlobPart], filename, { type: 'application/pdf' })
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'S-205b-E Auxiliary Pioneer Application' })
        return 'shared'
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'shared'
      }
    }
  } catch { /* File/share unsupported — fall through to download */ }

  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
  return 'downloaded'
}
