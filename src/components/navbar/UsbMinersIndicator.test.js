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
});
