import { FormattedMessage } from 'react-intl';
import { act, fireEvent, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { renderWithProviders } from '../../test-utils';
import NavbarAdmin from './NavbarAdmin';
import {
  MINER_RESTART_MUTATION,
  MINER_START_MUTATION,
  MINER_STOP_MUTATION,
} from '../../graphql/miner';
import { SOLO_RESTART_MUTATION } from '../../graphql/solo';
import { NODE_STOP_MUTATION } from '../../graphql/node';

// A mutation, unlike a query, is not de-duplicated by Apollo: two clicks are two
// network calls. These tests drive the real navbar with a real MockedProvider
// whose answer arrives late, and count how many times the "server" was hit.

let mockPage = 'miner';
let mockStatus = {};
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: `/${mockPage}` }),
}));
jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector) => {
    if (selector === 'services') return { data: mockStatus };
    if (selector === 'miner') return { loading: false, data: { stats: [] }, error: null };
    return { data: {} };
  },
  shallowEqual: () => true,
}));
jest.mock('../../redux/reselect/services', () => ({ servicesSelector: 'services' }));
jest.mock('../../redux/reselect/miner', () => ({ minerSelector: 'miner' }));
jest.mock('../../redux/reselect/settings', () => ({ settingsSelector: 'settings' }));
// What the device config says about starting: false on a Solo Node with no
// active USB board.
let mockCanStart = true;
jest.mock('../../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({
    canStartMiner: mockCanStart,
    startBlockedReason: mockCanStart ? null : 'none',
  }),
}));
jest.mock('../sidebar/Sidebar', () => ({ SidebarResponsive: () => null }));
jest.mock('./NavbarLinksAdmin', () => () => null);
jest.mock('../UI/StatusTransitionFeedback', () => () => null);

// The navbar derives which secondary buttons to show from the id of the route's
// name element.
const route = (path, id) => ({
  path,
  name: <FormattedMessage id={`routes.${id}`} defaultMessage={id} />,
});
const routes = [
  route('/miner', 'miner'),
  route('/soloMining', 'soloMining'),
  route('/node', 'node'),
];

const okPayload = (ns, field) => ({ data: { [ns]: { [field]: { error: null } } } });

const mockFor = (document, ns, field, calls) => ({
  request: { query: document },
  delay: 50,
  maxUsageCount: 5,
  result: () => {
    calls.count += 1;
    return okPayload(ns, field);
  },
});

// The secondary navbar sits in a box that is display:none below the xl
// breakpoint, hence hidden: true. The label text may be visually hidden while
// loading, so the button is found by its text once and kept.
const clickTwice = (label) => {
  const button = screen.getByText(label).closest('button');
  fireEvent.click(button);
  // second click while the first call is still in flight
  fireEvent.click(button);
};

const settle = () => act(() => new Promise((r) => setTimeout(r, 120)));

describe('navbar start/stop/restart buttons', () => {
  beforeEach(() => {
    mockStatus = {};
    mockCanStart = true;
  });

  it.each([
    ['online', 'Restart'],
    ['offline', 'Start'],
  ])('a %s miner with no USB board to run: %s is disabled and sends nothing', async (status, label) => {
    mockPage = 'miner';
    mockStatus = { miner: { status } };
    mockCanStart = false;
    const calls = { count: 0 };
    renderWithProviders(
      <MockedProvider
        mocks={[
          mockFor(MINER_RESTART_MUTATION, 'Miner', 'restart', calls),
          mockFor(MINER_START_MUTATION, 'Miner', 'start', calls),
        ]}
        addTypename={false}
      >
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    const button = screen.getByText(label).closest('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await settle();
    expect(calls.count).toBe(0);
  });

  it('with a board to run the same buttons are enabled', () => {
    mockPage = 'miner';
    mockStatus = { miner: { status: 'offline' } };
    renderWithProviders(
      <MockedProvider mocks={[]} addTypename={false}>
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    expect(screen.getByText('Start').closest('button')).not.toBeDisabled();
  });

  it('miner restart: a second click while the first is in flight sends no second mutation', async () => {
    mockPage = 'miner';
    mockStatus = { miner: { status: 'online' } };
    const calls = { count: 0 };
    renderWithProviders(
      <MockedProvider mocks={[mockFor(MINER_RESTART_MUTATION, 'Miner', 'restart', calls)]} addTypename={false}>
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    clickTwice('Restart');
    await settle();
    expect(calls.count).toBe(1);
  });

  it('miner stop is guarded too', async () => {
    mockPage = 'miner';
    mockStatus = { miner: { status: 'online' } };
    const calls = { count: 0 };
    renderWithProviders(
      <MockedProvider mocks={[mockFor(MINER_STOP_MUTATION, 'Miner', 'stop', calls)]} addTypename={false}>
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    clickTwice('Stop');
    await settle();
    expect(calls.count).toBe(1);
  });

  it('solo restart is guarded', async () => {
    mockPage = 'soloMining';
    mockStatus = { solo: { status: 'online' } };
    const calls = { count: 0 };
    renderWithProviders(
      <MockedProvider mocks={[mockFor(SOLO_RESTART_MUTATION, 'Solo', 'restart', calls)]} addTypename={false}>
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    clickTwice('Restart');
    await settle();
    expect(calls.count).toBe(1);
  });

  it('node stop shares the component and is guarded as well', async () => {
    mockPage = 'node';
    mockStatus = { node: { status: 'online' } };
    const calls = { count: 0 };
    renderWithProviders(
      <MockedProvider mocks={[mockFor(NODE_STOP_MUTATION, 'Node', 'stop', calls)]} addTypename={false}>
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    clickTwice('Stop');
    await settle();
    expect(calls.count).toBe(1);
  });

  it('the button is usable again once the call has finished', async () => {
    mockPage = 'miner';
    mockStatus = { miner: { status: 'online' } };
    const calls = { count: 0 };
    renderWithProviders(
      <MockedProvider mocks={[mockFor(MINER_RESTART_MUTATION, 'Miner', 'restart', calls)]} addTypename={false}>
        <NavbarAdmin routes={routes} />
      </MockedProvider>
    );
    fireEvent.click(screen.getByText('Restart').closest('button'));
    await settle();
    fireEvent.click(screen.getByText('Restart').closest('button'));
    await settle();
    expect(calls.count).toBe(2);
  });
});
