import { renderWithProviders } from '../test-utils';
import Automation from '../pages/automation';
import { useDeviceConfig } from '../contexts/DeviceConfigContext';

const replace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ replace, query: {} }) }));
jest.mock('../contexts/DeviceConfigContext', () => ({ useDeviceConfig: jest.fn() }));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => jest.fn(),
  useSelector: () => ({ data: { temperatureUnit: 'c' } }),
}));
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: () => ({ data: undefined, loading: true, refetch: jest.fn() }),
  useMutation: () => [jest.fn(), {}],
  useSubscription: () => ({}),
}));

describe('Automation page on a Solo Node', () => {
  beforeEach(() => replace.mockClear());

  it('sends a Solo Node to the overview, even with a board plugged in', () => {
    useDeviceConfig.mockReturnValue({ isSoloNode: true, hasMiner: true });
    renderWithProviders(<Automation />);
    expect(replace).toHaveBeenCalledWith('/overview');
  });

  it('leaves an Apollo where it is', () => {
    useDeviceConfig.mockReturnValue({ isSoloNode: false, hasMiner: true });
    renderWithProviders(<Automation />);
    expect(replace).not.toHaveBeenCalled();
  });
});
