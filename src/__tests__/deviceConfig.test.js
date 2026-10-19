import { render, screen, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DeviceConfigProvider, useDeviceConfig } from '../contexts/DeviceConfigContext';
import minerBoardsReducer, { updateMinerBoards } from '../redux/slices/minerBoardsSlice';

// What the settings screens branch on. Getting this wrong does not throw — it
// silently hides controls (an Apollo III without its own presets) or offers ones
// the hardware cannot honour, so the mapping is asserted per device.

const Probe = () => {
  const c = useDeviceConfig();
  if (c.loading) return <span>loading</span>;
  return (
    <span data-testid="probe">
      {[
        c.minerFamily,
        c.effectiveMinerFamily,
        c.hasUsbMiners,
        c.isHybrid,
        c.isSoloNode,
        c.hasMiner,
      ].map(String).join('|')}
    </span>
  );
};

const boardsPayload = (over = {}) => ({
  result: {
    boards: [],
    hasMiner: false,
    hasUsbMiners: false,
    usbCount: 0,
    usbActiveCount: 0,
    deviceFamily: 'unknown',
    ...over,
  },
  error: null,
});

const makeStore = () => configureStore({ reducer: { minerBoards: minerBoardsReducer } });

const mount = (store) =>
  render(
    <Provider store={store}>
      <DeviceConfigProvider>
        <Probe />
      </DeviceConfigProvider>
    </Provider>
  );

const renderWith = async (apiPayload, boards) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => apiPayload,
  });
  const store = makeStore();
  if (boards) {
    store.dispatch(updateMinerBoards({ loading: false, error: null, data: boardsPayload(boards) }));
  }
  mount(store);
  await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument());
  return screen.getByTestId('probe').textContent;
};

// minerFamily|effectiveMinerFamily|hasUsbMiners|isHybrid|isSoloNode|hasMiner
describe('DeviceConfigProvider — hardware mapping', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('Apollo III: its own miner family, no USB boards before the board list arrives', async () => {
    expect(await renderWith({ deviceType: 'miner', chassis: 'apollo-iii', usbMiners: false }))
      .toBe('apollo-iii|apollo-iii|false|false|false|true');
  });

  it('Apollo I/II: legacy family, and USB boards are assumed until the board list says otherwise', async () => {
    expect(await renderWith({ deviceType: 'miner', chassis: null, usbMiners: false }))
      .toBe('legacy|legacy|true|false|false|true');
  });

  it('Apollo I/II with no USB board attached: the live list wins over the hint', async () => {
    expect(
      await renderWith(
        { deviceType: 'miner', chassis: null, usbMiners: false },
        { hasMiner: true, hasUsbMiners: false }
      )
    ).toBe('legacy|legacy|false|false|false|true');
  });

  it('Apollo III with a USB board is hybrid, live', async () => {
    expect(
      await renderWith(
        { deviceType: 'miner', chassis: 'apollo-iii', usbMiners: false },
        { hasMiner: true, hasUsbMiners: true, usbCount: 1, usbActiveCount: 1 }
      )
    ).toBe('apollo-iii|apollo-iii|true|true|false|true');
  });

  it('keeps an Apollo\'s miner even when the board list is empty', async () => {
    // An internal miner that has crashed is still a miner to show.
    expect(
      await renderWith(
        { deviceType: 'miner', chassis: null, usbMiners: false },
        { hasMiner: false, hasUsbMiners: false }
      )
    ).toBe('legacy|legacy|false|false|false|true');
  });

  it('Solo Node before any board list: no miner, none assumed', async () => {
    expect(await renderWith({ deviceType: 'solo-node', chassis: 'solo-node', usbMiners: false }))
      .toBe('null|null|false|false|true|false');
  });

  it('Solo Node, board list empty: still no miner', async () => {
    expect(
      await renderWith(
        { deviceType: 'solo-node', chassis: 'solo-node', usbMiners: false },
        { hasMiner: false, hasUsbMiners: false }
      )
    ).toBe('null|null|false|false|true|false');
  });

  it('Solo Node with a USB miner: a miner to show, legacy presets, still a Solo Node', async () => {
    expect(
      await renderWith(
        { deviceType: 'solo-node', chassis: 'solo-node', usbMiners: false },
        { hasMiner: true, hasUsbMiners: true, usbCount: 1, usbActiveCount: 1 }
      )
    ).toBe('null|legacy|true|false|true|true');
  });

  it('follows the board list live: a board appearing after mount flips the Solo Node', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deviceType: 'solo-node', chassis: 'solo-node', usbMiners: false }),
    });
    const store = makeStore();
    mount(store);
    await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument());
    expect(screen.getByTestId('probe').textContent).toBe('null|null|false|false|true|false');

    act(() => {
      store.dispatch(
        updateMinerBoards({
          loading: false,
          error: null,
          data: boardsPayload({ hasMiner: true, hasUsbMiners: true, usbCount: 1, usbActiveCount: 1 }),
        })
      );
    });
    expect(screen.getByTestId('probe').textContent).toBe('null|legacy|true|false|true|true');
  });

  it('keeps the build-time values when the API call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    mount(makeStore());
    // Falls back rather than blanking the UI: without a chassis that is a legacy box.
    await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument());
    expect(screen.getByTestId('probe').textContent).toBe('legacy|legacy|true|false|false|true');
  });
});
