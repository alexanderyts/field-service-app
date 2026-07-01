interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' renders the confirm button red (default, for destructive actions); 'primary' renders it green. */
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop confirm-backdrop" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p className="muted">{message}</p>}
        <div className="row">
          <button className={tone === 'danger' ? 'danger' : ''} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
