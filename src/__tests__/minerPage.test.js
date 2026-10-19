import { renderWithProviders, screen } from '../test-utils';
import Miner from '../pages/miner';
import { useDeviceConfig } from '../contexts/DeviceConfigContext';

jest.mock('next/router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('../contexts/DeviceConfigContext', () => ({ useDeviceConfig: jest.fn() }));
jest.mock('../redux/reselect/settings', () => ({
  settingsSelector: () => ({ loading: false, data: { temperatureUnit: 'c' }, error: null }),
}));
jest.mock('../redux/reselect/services', () => ({
  servicesSelector: () => ({ loading: false, data: { miner: { status: 'online' } } }),
}));
jest.mock('../redux/reselect/miner', () => ({
  minerSelector: () => ({
    loading: false,
    error: [],
    data: {
      stats: {
        globalHashrate: { value: 1, unit: 'TH/s' },
        globalAvgHashrate: { value: 1, unit: 'TH/s' },
        activeBoards: 0,
        totalBoards: 1,
        activePools: 0,
        boards: [],
      },
    },
  }),
}));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: (selector) => selector({}),
}));
jest.mock('../components/apollo/HashrateCard', () => () => null);
jest.mock('../components/apollo/PowerCard', () => () => null);

const config = (isSoloNode) => ({
  effectiveMinerFamily: 'legacy',
  isSoloNode,
  hasMiner: true,
  boardsLive: true,
});

describe('Miner page, Total pools and hashboards card', () => {
  it('Solo Node: hashboards only, no Pools panel', () => {
    useDeviceConfig.mockReturnValue(config(true));
    renderWithProviders(<Miner />);
    expect(screen.queryByText('Total pools and hashboards')).not.toBeInTheDocument();
    expect(screen.queryByText('Pools')).not.toBeInTheDocument();
    // A lone unplugged board: Active 0/1.
    expect(screen.getByText(/Active 0\/1/)).toBeInTheDocument();
    // The card heading says it; the panel inside must not repeat it.
    expect(screen.getAllByText('Hashboards')).toHaveLength(1);
  });

  it('Apollo with a board: the Pools panel is still there', () => {
    useDeviceConfig.mockReturnValue(config(false));
    renderWithProviders(<Miner />);
    expect(screen.getByText('Total pools and hashboards')).toBeInTheDocument();
    expect(screen.getByText('Pools')).toBeInTheDocument();
    // Here the heading is the longer one, so the panel keeps its own title.
    expect(screen.getAllByText('Hashboards')).toHaveLength(1);
  });
});
