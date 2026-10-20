// How a pkg-library sheet page hands its answer back and leaves.
//
// The convention (ARCHITECTURE.md): call the callback first, then wx.navigateBack(). The callback
// may itself open another page — through store/actions.js afterSheet (it waits for this page to
// leave the top first), or straight away (exConfigSheet from a picker's onPick). The back must
// then not pop the page the callback just opened, nor run twice if the callback already went
// back itself. So the back waits a moment and looks:
//   - this page is gone (the callback navigated back / redirected): nothing to do;
//   - another page now sits on top of it (onHide ran): go back once this page shows again,
//     i.e. when that page returns — the sheet is then out of the way as the original's was;
//   - otherwise: go back now.
// The page must call `sheetShown(this)` in onShow, `sheetHidden(this)` in onHide and
// `sheetUnloaded(this)` in onUnload.
const BACK_DELAY = 80

export function finishSheet(page, cb) {
  if (page.__finished) return false
  page.__finished = true
  try { if (typeof cb === 'function') cb() } catch (err) { console.error(err) }
  setTimeout(() => {
    if (page.__unloaded) return
    if (page.__hiddenSheet) { page.__backOnShow = true; return }
    wx.navigateBack({ fail: () => { page.__backOnShow = true } })
  }, BACK_DELAY)
  return true
}

export function sheetShown(page) {
  page.__hiddenSheet = false
  if (page.__backOnShow) {
    page.__backOnShow = false
    setTimeout(() => { if (!page.__unloaded) wx.navigateBack() }, 0)
  }
}

export function sheetHidden(page) { page.__hiddenSheet = true }
export function sheetUnloaded(page) { page.__unloaded = true }

// Back first, then `fn` once this page is off the top (the original's close() followed by
// opening the next sheet).
export function backThen(page, fn) {
  if (page.__finished) return
  page.__finished = true
  let ran = false
  const run = () => { if (ran) return; ran = true; try { fn && fn() } catch (err) { console.error(err) } }
  wx.navigateBack({
    success: () => setTimeout(run, 0),
    fail: () => run(),
  })
}
