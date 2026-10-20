// <workout-row row="{{r}}" bind:open="onWorkout" /> — the small workout row of the Stats tab's
// "Recent workouts" (frontend/src/sheets.jsx WorkoutRow). The page formats the row
// ({ id, glyph, name, sub, mediaN, prN }) so the component does not subscribe to the store.
// Lives under pages/stats because a main-package page cannot use a subpackage component; the
// History page has its own copy in pkg-history/components.
//
// events: open  detail { id }  (a virtual host has no node of its own to bind a tap on)
Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    row: { type: Object, value: {} },
  },
  methods: {
    onTap() { this.triggerEvent('open', { id: this.properties.row && this.properties.row.id }) },
  },
})
