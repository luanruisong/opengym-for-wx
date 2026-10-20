// <switch-x checked="{{on}}" bind:change="onToggle" />  (ui.jsx Switch, the iOS-style toggle)
//
// properties
//   checked   Boolean
//   disabled  Boolean
// events
//   change   detail { value: boolean }  the new state (the component does not flip itself:
//            the page owns the value, like the original's (value, onChange))
// The tap is caught here, so a switch inside a tappable row does not also tap the row.
Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    checked: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    onTap() {
      if (this.properties.disabled) return
      this.triggerEvent('change', { value: !this.properties.checked })
    },
  },
})
