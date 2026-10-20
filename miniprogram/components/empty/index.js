// <empty icon="dumbbell" text="还没有训练" sub="…"><view class="btn primary">…</view></empty>
// The centred empty state (.empty).
//
// properties
//   icon   String  ''   icon name over the text
//   text   String  ''   the line
//   sub    String  ''   a smaller second line
//   cls    String  ''   extra classes (e.g. "plan-empty")
//   (default slot)      an action under the text
// events: none
Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    icon: { type: String, value: '' },
    text: { type: String, value: '' },
    sub: { type: String, value: '' },
    cls: { type: String, value: '' },
  },
})
