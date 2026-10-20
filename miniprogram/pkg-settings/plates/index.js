// Settings → Equipment → Plates (sheets.jsx PlateInventorySheet): the pairs of each plate size
// owned, for the profile's unit. The first edit copies the standard set into S.plates[unit] and
// changes one count; "Back to the standard set" empties the unit's list again (lib/plates.js).
import { connectPage } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
import { t } from '../../lib/i18n.js'
import { fmtPlate } from '../../lib/format.js'
import { PLATE_SIZES, pairsOf, ownsPlates, withPlatePairs, withStandardPlates } from '../../lib/plates.js'

const update = mut => useStore.getState().update(mut)

Page(connectPage({
  data: { rows: [], own: false, note: '', intro: '', pairsU: '', resetL: '', doneL: '' },

  mapState(S) {
    const unit = S.unit === 'lb' ? 'lb' : 'kg'
    const own = ownsPlates(S)
    return {
      intro: t('Pairs of each size you own. Every set row loads from this list, so a home gym with one pair of 45s is never told to use two.'),
      rows: PLATE_SIZES[unit].map(w => ({ w, label: fmtPlate(w) + ' ' + unit, n: pairsOf(S, w) })),
      pairsU: t('pairs'),
      own,
      note: own ? t('Your own list for {0}.', unit) : t('The standard set, plenty of each. Change any count to make it yours.'),
      resetL: t('Back to the standard set'),
      doneL: t('Done'),
    }
  },

  onPairs(e) {
    const w = Number(e.mark && e.mark.w)
    const n = e.detail.value
    if (!w || n == null) return
    update(s => { s.plates = withPlatePairs(s, w, n) })
  },

  onReset() { update(s => { s.plates = withStandardPlates(s) }) },

  onDone() { wx.navigateBack() },
}))
