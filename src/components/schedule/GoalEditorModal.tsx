import type { SchedulePrefs } from '../../db'
import ModalPortal from '../../ModalPortal'
import { Survey } from './Survey'

/** The role & goal questions as a pop-up with Cancel — opened from Service ("Change my goal")
    and from More ("Your goal"). */
export function GoalEditorModal({ prefs, onClose }: { prefs?: SchedulePrefs; onClose: () => void }) {
  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-expanded goal-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <Survey existing={prefs} onDone={onClose} onCancel={onClose} />
        </div>
      </div>
    </ModalPortal>
  )
}
