// Page/component smoke run (tools/smoke-pages.test.js):
//   cd frontend && npx vitest run --config ../miniprogram/tools/vitest.smoke.config.mjs
import base from './vitest.config.mjs'

export default Object.assign({}, base, {
  test: Object.assign({}, base.test, {
    include: ['tools/smoke-pages.test.js'],
    testTimeout: 20000,
    hookTimeout: 60000,
    // Pages are Page() side effects on one shared global; one file, run in order.
    fileParallelism: false,
  }),
})
