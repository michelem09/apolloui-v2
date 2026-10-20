import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act } from '@testing-library/react';
import { renderWithProviders, screen } from '../../test-utils';
import UsbMinersIndicator from './UsbMinersIndicator';
import minerBoardsReducer, { updateMinerBoards } from '../../redux/slices/minerBoardsSlice';
import feedbackReducer from '../../redux/slices/feedbackSlice';

const makeStore = () =>
  configureStore({ reducer: { minerBoards: minerBoardsReducer, feedback: feedbackReducer } });

const board = (id, kind, status, extra = {}) => ({
  id,
  uuid: id,
  serial: id,
  kind,
  status,
  since: '2026-10-19T10:00:00.000Z',
  expiresAt: '2026-10-19T10:15:00.000Z',
  ...extra,
});

const push = (store, boards) =>
  act(() => {
    store.dispatch(
      updateMinerBoards({
        loading: false,
        error: null,
        data: {
          result: {
            boards,
            hasMiner: true,
            hasUsbMiners: boards.some((b) => b.kind === 'usb'),
            usbCount: boards.filter((b) => b.kind === 'usb').length,
            usbActiveCount: boards.filter((b) => b.kind === 'usb' && b.status === 'active').length,
            deviceFamily: 'solo-node',
          },
          error: null,
        },
      })
    );
  });

const mount = (store) =>
  renderWithProviders(
    <Provider store={store}>
      <UsbMinersIndicator />
    </Provider>
  );

describe('UsbMinersIndicator', () => {
  it('renders nothing before the first board list', () => {
    mount(makeStore());
    expect(screen.queryByTestId('usb-miners-indicator')).not.toBeInTheDocument();
  });

  it('renders nothing when no USB board is known (internal only)', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('i', 'internal', 'active')]);
    expect(screen.queryByTestId('usb-miners-indicator')).not.toBeInTheDocument();
  });

  it('shows the number of active USB boards', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'active'), board('b', 'usb', 'active'), board('i', 'internal', 'active')]);
    expect(screen.getByTestId('usb-miners-indicator')).toHaveTextContent('2');
  });

  it('does not toast on the first list, even with a board already unplugged', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'disconnected')]);
    expect(store.getState().feedback.seq).toBe(0);
  });

  it('toasts once when an active board is unplugged, not on every later push', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'active')]);
    expect(store.getState().feedback.seq).toBe(0);

    push(store, [board('a', 'usb', 'disconnected')]);
    expect(store.getState().feedback.seq).toBe(1);
    expect(store.getState().feedback.type).toBe('warning');
    expect(store.getState().feedback.message).toMatch(/USB miner was disconnected.*15 minutes/);

    // Same list again (e.g. a reconnect of the socket): no second toast.
    push(store, [board('a', 'usb', 'disconnected')]);
    expect(store.getState().feedback.seq).toBe(1);
  });

  it('a board plugged back in does not toast', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'disconnected')]);
    push(store, [board('a', 'usb', 'active')]);
    expect(store.getState().feedback.seq).toBe(0);
  });

  const state = () => screen.getByTestId('usb-miners-indicator').getAttribute('data-state');

  it('booting: a spinner, the count still shows the active boards only', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'active'), board('b', 'usb', 'booting')]);
    expect(state()).toBe('booting');
    expect(screen.getByTestId('usb-miners-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('usb-miners-indicator')).toHaveTextContent(/^1/);
  });

  it('only a booting board: shown, with 0', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('b', 'usb', 'booting')]);
    expect(screen.getByTestId('usb-miners-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('usb-miners-indicator')).toHaveTextContent('0');
  });

  it('all active: no spinner', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'active')]);
    expect(state()).toBe('normal');
    expect(screen.queryByTestId('usb-miners-spinner')).not.toBeInTheDocument();
  });

  it('precedence: stuck beats disconnected beats booting', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'booting'), board('b', 'usb', 'disconnected')]);
    expect(state()).toBe('disconnected');
    expect(screen.queryByTestId('usb-miners-spinner')).not.toBeInTheDocument();
    push(store, [board('a', 'usb', 'booting'), board('b', 'usb', 'disconnected'), board('c', 'usb', 'stuck')]);
    expect(state()).toBe('stuck');
  });

  it('toasts an error once when a booting board turns stuck, never on the first list', () => {
    const store = makeStore();
    mount(store);
    push(store, [board('a', 'usb', 'stuck', { serial: '123456789' })]);
    expect(store.getState().feedback.seq).toBe(0);

    const s2 = makeStore();
    mount(s2);
    push(s2, [board('a', 'usb', 'booting', { serial: '123456789' })]);
    push(s2, [board('a', 'usb', 'stuck', { serial: '123456789' })]);
    expect(s2.getState().feedback.seq).toBe(1);
    expect(s2.getState().feedback.type).toBe('error');
    expect(s2.getState().feedback.message).toMatch(/…456789 is not responding/);
    push(s2, [board('a', 'usb', 'stuck', { serial: '123456789' })]);
    expect(s2.getState().feedback.seq).toBe(1);
  });
});
