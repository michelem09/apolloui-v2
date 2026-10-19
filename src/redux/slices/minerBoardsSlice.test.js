import { configureStore } from '@reduxjs/toolkit';
import reducer, { updateMinerBoards } from './minerBoardsSlice';
import { minerBoardsSelector } from '../reselect/minerBoards';

const makeStore = () => configureStore({ reducer: { minerBoards: reducer } });

const payload = (result) => ({ result, error: null });
const board = (over = {}) => ({
  id: 'abc',
  uuid: 'abc',
  kind: 'usb',
  status: 'active',
  ...over,
});

describe('minerBoards slice and selector', () => {
  it('starts as never received, not as an empty list', () => {
    const state = makeStore().getState();
    const sel = minerBoardsSelector(state);
    expect(sel.received).toBe(false);
    expect(sel.live).toBe(false);
    expect(sel.loading).toBe(true);
  });

  it('a bare loading tick is not an answer', () => {
    const store = makeStore();
    store.dispatch(updateMinerBoards({ loading: true, error: null, data: null }));
    expect(minerBoardsSelector(store.getState()).received).toBe(false);
  });

  it('an empty board list is a real answer', () => {
    const store = makeStore();
    store.dispatch(
      updateMinerBoards({
        loading: false,
        error: null,
        data: payload({ boards: [], hasMiner: false, hasUsbMiners: false, usbCount: 0, usbActiveCount: 0, deviceFamily: 'solo-node' }),
      })
    );
    const sel = minerBoardsSelector(store.getState());
    expect(sel.received).toBe(true);
    expect(sel.live).toBe(true);
    expect(sel.loading).toBe(false);
    expect(sel.boards).toEqual([]);
    expect(sel.hasMiner).toBe(false);
    expect(sel.deviceFamily).toBe('solo-node');
  });

  it('exposes the counters and boards of a payload', () => {
    const store = makeStore();
    store.dispatch(
      updateMinerBoards({
        loading: false,
        error: null,
        data: payload({
          boards: [board(), board({ id: 'x', status: 'disconnected' })],
          hasMiner: true,
          hasUsbMiners: true,
          usbCount: 2,
          usbActiveCount: 1,
          deviceFamily: 'solo-node',
        }),
      })
    );
    const sel = minerBoardsSelector(store.getState());
    expect(sel.boards).toHaveLength(2);
    expect(sel.hasUsbMiners).toBe(true);
    expect(sel.usbCount).toBe(2);
    expect(sel.usbActiveCount).toBe(1);
  });

  it('a payload carrying only an error is received but not live', () => {
    const store = makeStore();
    store.dispatch(
      updateMinerBoards({
        loading: false,
        error: null,
        data: { result: null, error: { message: 'boom' } },
      })
    );
    const sel = minerBoardsSelector(store.getState());
    expect(sel.received).toBe(true);
    expect(sel.live).toBe(false);
    expect(sel.error).toHaveLength(1);
  });
});
