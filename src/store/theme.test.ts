import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { themeCycled, themeRestored } from './slices/viewSlice';
import { fakeMeshApi } from '../test/fakeMeshApi';

const store = () => createStore(fakeMeshApi());

describe('the theme', () => {
  it('starts by following the machine, which is not the same as choosing light', () => {
    // The distinction is the whole reason there are three states: a reader whose OS switches at dusk
    // should switch with it, right up until they say otherwise.
    expect(store().getState().view.theme).toBe('system');
  });

  it('cycles system → light → dark → system', () => {
    const s = store();
    const seen = [s.getState().view.theme];
    for (let i = 0; i < 3; i++) {
      s.dispatch(themeCycled());
      seen.push(s.getState().view.theme);
    }
    expect(seen).toEqual(['system', 'light', 'dark', 'system']);
  });

  it('restores a remembered choice without treating it as a new one', () => {
    const s = store();
    s.dispatch(themeRestored('dark'));
    expect(s.getState().view.theme).toBe('dark');

    // And carries on from there rather than from the start of the cycle.
    s.dispatch(themeCycled());
    expect(s.getState().view.theme).toBe('system');
  });
});
