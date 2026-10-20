// The body map's SVG outlines (data-ex/body-paths.js, ~90 KB). They live in the data subpackage
// with the exercise catalogue so the main package stays small; boot-data.js loads them at launch
// and hands them in here. Readers run after getApp().ready, when they are set.
let BODY = null
export const setBodyPaths = b => { BODY = b || null }
export const bodyPaths = () => BODY
