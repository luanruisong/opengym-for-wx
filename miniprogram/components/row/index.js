// <row icon="bell" icon-tint="var(--orange)" title="休息提醒" subtitle="…" value="1:30"
//      accessory="chevron" tap bind:tap="onOpen"><switch-x …/></row>     (ui.jsx Row)
// A settings row for an inset group (.sect-b). Rows are siblings in the layout (virtual host),
// so the hairline between two rows is drawn as in the original.
//
// properties
//   icon       String  ''       icon name for the coloured square on the left
//   iconTint   String  ''       its background (any CSS colour / var(); default the accent)
//   title      String
//   subtitle   String  ''
//   value      String  ''       grey value at the end (pass a string; '' hides it)
//   accessory  String  'none'   'chevron' | 'check' | 'none'
//   danger     Boolean false    red title
//   tap        Boolean false    tappable look (press tint); also required for the tap event
//   dis        Boolean false    dimmed (.lrow.dis)
//   cls        String  ''       extra classes on .lrow
//   (default slot)              controls placed between the title and the value (a switch, a seg…)
// events
//   tap        detail {}        when `tap` is set
Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    icon: { type: String, value: '' },
    iconTint: { type: String, value: '' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    value: { type: null, value: '' },
    accessory: { type: String, value: 'none' },
    danger: { type: Boolean, value: false },
    tap: { type: Boolean, value: false },
    dis: { type: Boolean, value: false },
    cls: { type: String, value: '' },
  },
  data: { valueText: '', tintStyle: '' },
  observers: {
    value(v) { this.setData({ valueText: v === null || v === undefined ? '' : String(v) }) },
    iconTint(c) { this.setData({ tintStyle: c ? 'background:' + c + ';' : '' }) },
  },
  methods: {
    onTap() {
      if (this.properties.tap) this.triggerEvent('tap', {})
    },
  },
})
