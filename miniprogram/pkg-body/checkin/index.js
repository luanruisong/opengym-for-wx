// Gym check-in (frontend/src/views/CheckIn.jsx; route /checkin, from the Home "Check in" card).
// Each saved membership code is shown as a QR the turnstile can read, swiped through
// horizontally (a <swiper>), with a trailing "+" slide to add another. Only the code's value and
// symbology are stored; the QR is redrawn from it every time (qr.js + <qr-code>).
//
// The rail reopens on the card used last (lastGymCardId) and remembers the one you settle on.
// Cards are added by scanning or from a photo only (pkg-body/card), never typed. With more than
// one card each carries ◀ ▶ buttons to nudge it along the rail.
import { connectPage } from '../../utils/page.js'
import { openPage } from '../../utils/nav.js'
import { confirmSheet } from '../../utils/sheets.js'
import { t } from '../../lib/i18n.js'
import { S, update } from '../_shared.js'

// Move the card at `from` to index `to`, returning a new array (CheckIn.jsx moveGymCard).
export function moveGymCard(cards, from, to) {
  const next = [...cards]
  if (from < 0 || from >= next.length) return next
  const target = Math.max(0, Math.min(to, next.length - 1))
  if (target === from) return next
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

// The add/edit sheet (CheckIn.jsx openAddCard / openEditCard).
export const openAddCard = () => openPage('/pkg-body/card/index', {})
export const openEditCard = card => openPage('/pkg-body/card/index', { card })

Page(connectPage({
  data: { cards: [], count: 0, current: 0, active: 0, sub: '' },
  mapState(st) {
    const cards = st.gymCards || []
    // Open on the last-used card whenever the saved id or the number of cards changes (the
    // original's layout effect); a stale id falls back to the first card. Otherwise the swiper
    // stays wherever the user left it.
    const key = (st.lastGymCardId || '') + '|' + cards.length
    if (key !== this.__ciKey) {
      this.__ciKey = key
      this.__cur = Math.max(0, cards.findIndex(c => c.id === st.lastGymCardId))
      this.setData({ active: this.__cur })
    }
    return {
      cards: cards.map((c, i) => ({ id: c.id, label: c.label, value: c.value, i, pos: (i + 1) + ' / ' + cards.length, first: i === 0, last: i === cards.length - 1 })),
      count: cards.length,
      current: this.__cur || 0,
      sub: cards.length ? t('Show this at the gym') : t('Add your gym card'),
    }
  },
  onSwipe(e) {
    const i = e.detail.current
    if (i === this.data.active) return
    this.setData({ active: i })
    const st = S()
    const card = (st.gymCards || [])[i]
    if (card && card.id !== st.lastGymCardId) {
      this.__ciKey = card.id + '|' + st.gymCards.length   // already showing it: no jump
      this.__cur = i
      update(s => { s.lastGymCardId = card.id }, false)
    }
  },
  cardAt(e) {
    const id = e.currentTarget.dataset.id
    return (S().gymCards || []).find(c => c.id === id)
  },
  onAdd() { openAddCard() },
  onEdit(e) { const c = this.cardAt(e); if (c) openEditCard(c) },
  onRemove(e) {
    const card = this.cardAt(e)
    if (!card) return
    confirmSheet({
      title: t('Remove this card?'),
      message: card.label,
      confirmText: t('Remove'),
      danger: true,
      onConfirm: () => update(s => {
        s.gymCards = (s.gymCards || []).filter(c => c.id !== card.id)
        if (s.lastGymCardId === card.id) s.lastGymCardId = (s.gymCards[0] && s.gymCards[0].id) || null
      }),
    })
  },
  onMove(e) {
    const { i, d } = e.currentTarget.dataset
    const index = Number(i)
    const to = index + Number(d)
    const cards = S().gymCards || []
    if (to < 0 || to >= cards.length) return
    update(s => { s.gymCards = moveGymCard(s.gymCards, index, to) })
    // Follow the card along the rail.
    this.__cur = to
    this.setData({ current: to, active: to })
  },
}))
