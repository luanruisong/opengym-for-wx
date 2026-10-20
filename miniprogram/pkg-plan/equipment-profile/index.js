// Create or edit one equipment profile (frontend/src/sheets.jsx EquipmentProfileSheet): a name
// plus a checklist of what you have there. An empty name does not save. params: { profile }.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { ALL_EQUIPMENT, newProfile, profileEquipment, ACC_V } from '../../lib/equipment.js'
import { t } from '../../lib/i18n.js'

Page(connectPage({
  data: { name: '', items: [] },
  onLoad(query) {
    this.params = pageParams(query)
    const profile = this.params.profile || null
    this.profile = profile
    this.name = (profile && profile.name) || ''
    this.checked = new Set(profile ? profileEquipment(profile) : [])
    if (profile) wx.setNavigationBarTitle({ title: t('Edit profile') })
    this.setData({
      name: this.name,
      items: ALL_EQUIPMENT.map(k => ({ k, label: t(k), on: this.checked.has(k) })),
    })
  },
  onUnload() {
    releasePage(this.query)
  },
  onName(e) {
    this.name = e.detail.value
  },
  onToggle(e) {
    const i = e.currentTarget.dataset.i
    const it = this.data.items[i]
    if (!it) return
    if (this.checked.has(it.k)) this.checked.delete(it.k)
    else this.checked.add(it.k)
    this.setData({ ['items[' + i + '].on']: this.checked.has(it.k) })
  },
  onSave() {
    if (this.done) return
    const name = String(this.name || '').trim()
    if (!name) return
    this.done = true
    const profile = this.profile
    const equipment = [...this.checked]
    useStore.getState().update(s => {
      s.equipProfiles = s.equipProfiles || []
      if (profile) {
        const p = s.equipProfiles.find(x => x.id === profile.id)
        if (p) { p.name = name; p.equipment = equipment; p.accV = ACC_V }
      } else {
        const p = newProfile(name)
        p.equipment = equipment
        s.equipProfiles.push(p)
        if (!s.activeEquipId) s.activeEquipId = p.id
      }
    })
    wx.navigateBack()
  },
}))
