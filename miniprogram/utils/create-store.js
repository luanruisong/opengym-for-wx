// A zustand-shaped store without React: create((set, get, api) => initialState) returns `useStore`,
// which carries getState / setState / subscribe like zustand's vanilla store. Calling
// useStore(selector) just reads the current state through the selector, so the ported store code
// that does `useStore.getState()` / `useStore.setState(...)` keeps working unchanged.
export function create(init) {
  let state
  const listeners = new Set()
  const setState = (partial, replace) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    if (next === state || next == null) return
    const prev = state
    state = replace ? next : Object.assign({}, state, next)
    listeners.forEach(l => { try { l(state, prev) } catch (e) { console.error(e) } })
  }
  const getState = () => state
  const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }
  const api = { setState, getState, subscribe }
  state = init(setState, getState, api)
  const useStore = selector => (selector ? selector(state) : state)
  return Object.assign(useStore, api)
}
