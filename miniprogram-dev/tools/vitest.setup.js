// Test setup: a minimal in-memory `wx` (storage, file system, audio, vibration…) so lib modules
// that touch it can run in Node, and the exercise catalogue loaded the way boot-data.js does it.
import { initExercises } from '../../miniprogram/lib/exercises.js'
import { EXDB, EXALIAS } from '../../miniprogram/data-ex/exercises-data.js'
import BODY from '../../miniprogram/data-ex/body-paths.js'
import { setBodyPaths } from '../../miniprogram/lib/body-data.js'
import { installWxMock } from './wx-mock.js'

installWxMock()
initExercises({ EXDB, EXALIAS })
setBodyPaths(BODY)
