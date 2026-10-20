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
    <span data-testid="probe" data-can-start={String(c.canStartMiner)}>
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

const canStart = async (apiPayload, boards) => {
  await renderWith(apiPayload, boards);
  return screen.getByTestId('probe').getAttribute('data-can-start');
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

  describe('canStartMiner', () => {
    const solo = { deviceType: 'solo-node', chassis: 'solo-node', usbMiners: false };

    it('Solo Node with no board list yet: not startable, so it never flashes enabled', async () => {
      expect(await canStart(solo)).toBe('false');
    });

    it('Solo Node with no board at all: not startable', async () => {
      expect(await canStart(solo, { hasMiner: false })).toBe('false');
    });

    it('Solo Node with its only USB board disconnected: not startable', async () => {
      // hasMiner and usbCount stay set during the 15 min the board is listed.
      expect(
        await canStart(solo, { hasMiner: true, hasUsbMiners: true, usbCount: 1, usbActiveCount: 0 })
      ).toBe('false');
    });

    const ub = (id, status) => ({ id, kind: 'usb', status });
    const attached = (boards) => ({
      hasMiner: true,
      hasUsbMiners: true,
      usbCount: boards.length,
      usbActiveCount: boards.filter((x) => x.status === 'active').length,
      boards,
    });

    it('Solo Node with a booting USB board: startable (the miner starts when it is ready)', async () => {
      expect(await canStart(solo, attached([ub('a', 'booting')]))).toBe('true');
    });

    it('Solo Node with only a stuck board: not startable', async () => {
      expect(await canStart(solo, attached([ub('a', 'stuck')]))).toBe('false');
    });

    it('Solo Node with stuck + booting: startable', async () => {
      expect(await canStart(solo, attached([ub('a', 'stuck'), ub('b', 'booting')]))).toBe('true');
    });

    it('Solo Node with stuck + disconnected: not startable', async () => {
      expect(await canStart(solo, attached([ub('a', 'stuck'), ub('b', 'disconnected')]))).toBe('false');
    });

    it.each(['booting', 'stuck'])('a %s board counts as USB miners attached', async (status) => {
      const out = await renderWith(solo, attached([ub('a', status)]));
      expect(out.split('|')[2]).toBe('true');
    });

    it('Solo Node with an active USB board: startable', async () => {
      expect(
        await canStart(solo, { hasMiner: true, hasUsbMiners: true, usbCount: 1, usbActiveCount: 1 })
      ).toBe('true');
    });

    it('Apollo: always startable, even with no board list and no active USB board', async () => {
      const apollo = { deviceType: 'miner', chassis: null, usbMiners: false };
      expect(await canStart(apollo)).toBe('true');
      expect(await canStart(apollo, { hasMiner: true, usbCount: 1, usbActiveCount: 0 })).toBe('true');
    });
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

// Before /api/config answers, nothing may assume a miner: the device-type variable
// is gone, so a Solo Node would otherwise flash the miner UI and open the miner
// subscription. The layout holds its first paint on `loading`.
describe('DeviceConfigProvider — before /api/config answers', () => {
  const EarlyProbe = () => {
    const c = useDeviceConfig();
    return (
      <span data-testid="early">{[c.loading, c.deviceType, c.hasMiner, c.isSoloNode].map(String).join('|')}</span>
    );
  };

  it('does not assume a miner while the type is unknown', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    render(
      <Provider store={makeStore()}>
        <DeviceConfigProvider>
          <EarlyProbe />
        </DeviceConfigProvider>
      </Provider>
    );
    expect(screen.getByTestId('early').textContent).toBe('true|null|false|false');
  });

  it('falls back to an Apollo (with its miner) when the API fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    render(
      <Provider store={makeStore()}>
        <DeviceConfigProvider>
          <EarlyProbe />
        </DeviceConfigProvider>
      </Provider>
    );
    await waitFor(() => expect(screen.getByTestId('early').textContent).toBe('false|miner|true|false'));
  });
});
