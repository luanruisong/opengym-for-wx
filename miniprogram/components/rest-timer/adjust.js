// The rest clock's "set the time left" (frontend/src/components/RestTimer.jsx adjustRestSheet /
// applyRestLeft): a tap on the clock opens the wheel at the time that is left; 0:00 ends the rest.
import { useUI } from '../../store/ui.js'
import { REST_MAX } from '../../lib/duration.js'
import { durationSheet } from '../../utils/duration-sheet.js'

export function adjustRestSheet() {
  const tm = useUI.getState().timer
  if (!tm) return
  const opened = tm.ready ? 0 : Math.min(tm.left, REST_MAX)
  durationSheet({
    title: '剩余时间', value: opened, max: REST_MAX, off: '跳过',
    footer: '滚到 0:00 可立即结束休息。',
    onDone: v => applyRestLeft(v, opened),
  })
}

// What Done does to the rest as it is by then: a new time left, the rest ended at 0:00, or a
// fresh rest when the old one ran out (Ready) or was skipped meanwhile.
export function applyRestLeft(v, opened) {
  if (opened !== undefined && v === opened) return
  const ui = useUI.getState()
  const now = ui.timer
  if (!now) { if (v > 0) ui.startRest(v); return }
  if (v <= 0) { ui.stopRest(); return }
  if (now.ready) { ui.startRest(v, now.forIdx); return }
  if (v !== now.left) ui.addRest(v - now.left)
}
