// <workout-row row="{{row}}" bind:open="onOpen" /> — sheets.jsx WorkoutRow. `row` comes from
// ../rows.js workoutRowOf (plus whatever the page adds, e.g. `i`); a tap fires
// open { key, i } with the row's own key and index. A virtual host, so the .item sits straight
// in its .list.
Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: { row: { type: Object, value: {} } },
  methods: {
    onTap() {
      const r = this.properties.row || {}
      this.triggerEvent('open', { key: r.key, i: r.i })
    },
  },
})
