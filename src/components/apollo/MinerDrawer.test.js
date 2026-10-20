import { renderWithProviders, screen } from '../../test-utils';
import MinerDrawer from './MinerDrawer';

jest.mock('../../redux/reselect/settings', () => ({
  settingsSelector: () => ({ data: { temperatureUnit: 'c' } }),
}));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: (selector) => selector({}),
}));

const board = (extra = {}) => ({
  status: true,
  poolStatus: true,
  hashrateInGh: 1000,
  temperature: 50,
  fanSpeed: 1000,
  wattTotal: 100,
  voltage: 1,
  errorRate: 0,
  chips: 10,
  version: 'v2',
  kind: 'usb',
  poolHost: 'pool.example',
  poolPort: 3333,
  poolUsername: 'user',
  ...extra,
});

const mount = (data, props = {}) =>
  renderWithProviders(<MinerDrawer isOpen onClose={() => {}} placement="right" data={data} {...props} />);

describe('MinerDrawer', () => {
  it('shows the Pools tab and the full title by default', () => {
    mount([board()]);
    expect(screen.getByRole('tab', { name: /Pools/ })).toBeInTheDocument();
    expect(screen.getByText('Hashboards and Pools')).toBeInTheDocument();
  });

  it('hidePools drops the Pools tab and the "and Pools" title', () => {
    mount([board()], { hidePools: true });
    expect(screen.queryByRole('tab', { name: /Pools/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Hashboards and Pools')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Hashboards/ })).toBeInTheDocument();
  });

  it('counts a disconnected board in the denominator: Active 0/1', () => {
    mount([board({ status: false, poolStatus: false, disconnected: true })], { hidePools: true });
    expect(screen.getByRole('tab', { name: /Hashboards/ })).toHaveTextContent('0/1');
  });
});
