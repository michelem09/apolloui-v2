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
import { CACHED_MQTT_TOPICS_QUERY } from '../../graphql/mqtt';
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

// The card keeps the modal mounted and toggles isOpen, like the real page.
const Harness = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen</button>
      <MqttBrowseModal isOpen={open} onClose={() => setOpen(false)} brokerInput={() => ({ host: 'b' })} onPick={() => {}} />
    </>
  );
};

const setup = () => {
  const store = configureStore({ reducer: { mqttBrowse: mqttBrowseReducer } });
  const utils = render(
    <Provider store={store}>
      <MockedProvider mocks={[cachedMock]} addTypename>
        <ChakraProvider>
          <IntlProvider locale="en" messages={flattenMessages(en)}>
            <Harness />
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
    const remaining = within(document.body).getByText(/^\d+s$/);
    expect(Number(remaining.textContent.replace('s', ''))).toBeLessThanOrEqual(40);
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
        <MockedProvider mocks={[cachedMock]} addTypename>
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
