// Page/component smoke run (tools/smoke-pages.test.js): every page and component in app.json goes
// through its lifecycle under three store states.   npm run test:smoke
import base from '../vitest.config.mjs'

export default {
  ...base,
  test: {
    ...base.test,
    include: ['tools/smoke-pages.test.js'],
    exclude: ['node_modules/**'],
    testTimeout: 20000,
    hookTimeout: 60000,
    // Pages are Page() side effects on one shared global; one file, run in order.
    fileParallelism: false,
  },
}
