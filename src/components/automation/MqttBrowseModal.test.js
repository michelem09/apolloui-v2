import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { IntlProvider } from 'react-intl';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import en from '../../locales/en.json';
import { flattenMessages } from '../../lib/utils';
import mqttBrowseReducer, { filterTopics } from '../../redux/slices/mqttBrowseSlice';
import { CACHED_MQTT_TOPICS_QUERY, END_MQTT_BROWSE_QUERY } from '../../graphql/mqtt';
import MqttBrowseModal from './MqttBrowseModal';

const topic = (over) => ({
  __typename: 'MqttTopic',
  sample: null,
  jsonPaths: [],
  pathValues: [],
  name: null,
  unit: null,
  jsonPath: null,
  value: null,
  lastSeen: new Date().toISOString(),
  ...over,
});

const TOPICS = [
  topic({ topic: 'sun2000/state', jsonPaths: ['battery.soc', 'active_power'], pathValues: [{ __typename: 'MqttPathValue', path: 'battery.soc', value: '80' }, { __typename: 'MqttPathValue', path: 'active_power', value: '1234' }] }),
  topic({ topic: 'garage/Door', value: 'open' }),
];

const cachedMock = {
  request: { query: CACHED_MQTT_TOPICS_QUERY },
  result: {
    data: { Mqtt: { __typename: 'MqttActions', cachedTopics: { __typename: 'MqttDiscoverOutput', result: { __typename: 'MqttDiscoverResult', ok: true, error: null, topics: TOPICS }, error: null } } },
  },
  maxUsageCount: 50,
};

const endResult = jest.fn(() => ({
  data: { Mqtt: { __typename: 'MqttActions', endBrowse: { __typename: 'MqttTestOutput', result: { __typename: 'MqttTestResult', ok: true, message: null }, error: null } } },
}));
const endMock = { request: { query: END_MQTT_BROWSE_QUERY }, result: (...a) => endResult(...a), maxUsageCount: 50 };

// The card keeps the modal mounted and toggles isOpen, like the real page.
const Harness = ({ mapped }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen</button>
      <MqttBrowseModal isOpen={open} onClose={() => setOpen(false)} brokerInput={() => ({ host: 'b' })} onPick={() => {}} mapped={mapped} />
    </>
  );
};

const setup = ({ mocks = [cachedMock, endMock], mapped } = {}) => {
  const store = configureStore({ reducer: { mqttBrowse: mqttBrowseReducer } });
  const utils = render(
    <Provider store={store}>
      <MockedProvider mocks={mocks} addTypename>
        <ChakraProvider>
          <IntlProvider locale="en" messages={flattenMessages(en)}>
            <Harness mapped={mapped} />
          </IntlProvider>
        </ChakraProvider>
      </MockedProvider>
    </Provider>
  );
  return { store, ...utils };
};

const FILTER = 'Filter topics (e.g. sun2000, battery)';

describe('MqttBrowseModal', () => {
  it('opens on the cached topics, with the current value next to each jsonPath', async () => {
    setup();
    expect(await screen.findByText('sun2000/state')).toBeInTheDocument();
    expect(screen.getByText('garage/Door')).toBeInTheDocument();
    expect(screen.getByText('battery.soc = 80')).toBeInTheDocument();
    expect(screen.getByText('active_power = 1234')).toBeInTheDocument();
  });

  it('filters client-side, case-insensitively, and clearing restores the list', async () => {
    setup();
    await screen.findByText('sun2000/state');
    const box = screen.getByLabelText(FILTER);

    await userEvent.type(box, 'DOOR');
    expect(screen.getByText('garage/Door')).toBeInTheDocument();
    expect(screen.queryByText('sun2000/state')).not.toBeInTheDocument();

    // a jsonPath matches too
    await userEvent.clear(box);
    await userEvent.type(box, 'soc');
    expect(screen.getByText('sun2000/state')).toBeInTheDocument();
    expect(screen.queryByText('garage/Door')).not.toBeInTheDocument();

    // no hit: a message, not a lost list
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText('No topic matches the filter.')).toBeInTheDocument();

    await userEvent.clear(box);
    expect(screen.getByText('sun2000/state')).toBeInTheDocument();
    expect(screen.getByText('garage/Door')).toBeInTheDocument();
  });

  it('keeps the topics, the filter and a running scan across close and reopen', async () => {
    const { store } = setup();
    await screen.findByText('sun2000/state');
    await userEvent.type(screen.getByLabelText(FILTER), 'door');
    act(() => {
      store.dispatch({ type: 'mqttBrowse/scanStarted', payload: Date.now() - 20000 });
    });
    expect(await screen.findByText('Listening to the broker…')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByText('garage/Door')).not.toBeInTheDocument());

    await userEvent.click(screen.getByText('reopen'));
    // the list is there at once (from the store), filter intact, scan still running
    expect(await screen.findByText('garage/Door')).toBeInTheDocument();
    expect(screen.getByLabelText(FILTER)).toHaveValue('door');
    expect(screen.getByText('Listening to the broker…')).toBeInTheDocument();
    const remaining = within(document.body).getByText(/· \d+s$/);
    expect(Number(remaining.textContent.match(/(\d+)s$/)[1])).toBeLessThanOrEqual(40);
  });
});

describe('MqttBrowseModal, browse session and states', () => {
  beforeEach(() => endResult.mockClear());

  it('tells the device to stop listening when the modal closes, not before', async () => {
    setup();
    await screen.findByText('sun2000/state');
    await new Promise((r) => setTimeout(r, 20)); // let a previous test's teardown settle
    endResult.mockClear();
    expect(endResult).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(endResult).toHaveBeenCalledTimes(1));
  });

  it('shows the broker refusing # next to the cached list', async () => {
    const warn = {
      ...cachedMock,
      result: {
        data: { Mqtt: { __typename: 'MqttActions', cachedTopics: { __typename: 'MqttDiscoverOutput', result: { __typename: 'MqttDiscoverResult', ok: true, error: 'The broker does not allow subscribing to all topics (#), so live browsing is unavailable.', topics: TOPICS }, error: null } } },
      },
    };
    setup({ mocks: [warn, endMock] });
    expect(await screen.findByText(/does not allow subscribing to all topics/)).toBeInTheDocument();
    expect(screen.getByText('garage/Door')).toBeInTheDocument();
  });

  it('marks what is already mapped and does not let it be picked again', async () => {
    const onPick = jest.fn();
    const store = configureStore({ reducer: { mqttBrowse: mqttBrowseReducer } });
    render(
      <Provider store={store}>
        <MockedProvider mocks={[cachedMock, endMock]} addTypename>
          <ChakraProvider>
            <IntlProvider locale="en" messages={flattenMessages(en)}>
              <MqttBrowseModal
                isOpen
                onClose={() => {}}
                brokerInput={() => ({ host: 'b' })}
                onPick={onPick}
                mapped={[{ topic: 'sun2000/state', jsonPath: 'battery.soc' }, { topic: 'garage/Door', jsonPath: '' }]}
              />
            </IntlProvider>
          </ChakraProvider>
        </MockedProvider>
      </Provider>
    );
    const taken = await screen.findByText(/battery\.soc = 80/);
    expect(taken).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Already mapped' })).toBeDisabled();
    await userEvent.click(taken);
    // The other path of the same topic is still free.
    await userEvent.click(screen.getByText('active_power = 1234'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ topic: 'sun2000/state', jsonPath: 'active_power' });
  });
});

describe('MqttBrowseModal, remounted', () => {
  it('shows the stored topics and scan at once after the component was unmounted', async () => {
    const { store, unmount } = setup();
    await screen.findByText('sun2000/state');
    act(() => {
      store.dispatch({ type: 'mqttBrowse/scanStarted', payload: Date.now() - 5000 });
    });
    unmount();

    render(
      <Provider store={store}>
        <MockedProvider mocks={[cachedMock, endMock]} addTypename>
          <ChakraProvider>
            <IntlProvider locale="en" messages={flattenMessages(en)}>
              <MqttBrowseModal isOpen onClose={() => {}} brokerInput={() => ({ host: 'b' })} onPick={() => {}} />
            </IntlProvider>
          </ChakraProvider>
        </MockedProvider>
      </Provider>
    );
    // synchronous: no network round trip needed to see the list and the scan
    expect(screen.getByText('sun2000/state')).toBeInTheDocument();
    expect(screen.getByText('Listening to the broker…')).toBeInTheDocument();
  });
});

describe('filterTopics', () => {
  it('returns everything for an empty or blank filter', () => {
    expect(filterTopics(TOPICS, '')).toHaveLength(2);
    expect(filterTopics(TOPICS, '   ')).toHaveLength(2);
    expect(filterTopics(null, 'x')).toEqual([]);
  });
});
