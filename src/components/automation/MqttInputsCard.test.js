import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { IntlProvider } from 'react-intl';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import mqttBrowseReducer from '../../redux/slices/mqttBrowseSlice';

import en from '../../locales/en.json';
import { flattenMessages } from '../../lib/utils';
import MqttInputsCard from './MqttInputsCard';
import { GET_MQTT_QUERY, SET_MQTT_QUERY, CACHED_MQTT_TOPICS_QUERY, END_MQTT_BROWSE_QUERY } from '../../graphql/mqtt';

const config = {
  __typename: 'MqttConfig',
  enabled: true,
  host: 'broker',
  port: 1883,
  username: null,
  tls: false,
  status: { __typename: 'MqttStatus', connected: true, error: null },
  output: {
    __typename: 'MqttOutput',
    enabled: false,
    control: true,
    deviceId: 'x',
    exports: { __typename: 'MqttExports', miner: true, node: true, solo: true, mcu: false },
  },
  inputs: [{ __typename: 'MqttInput', name: 'surplus', topic: 'sun/surplus', jsonPath: null, unit: 'W' }],
};
const ok = (key) => ({ data: { Mqtt: { [key]: { __typename: 'MqttConfigOutput', result: config, error: null } } } });

const mocks = [
  { request: { query: GET_MQTT_QUERY }, result: ok('config'), maxUsageCount: 5 },
  {
    request: {
      query: SET_MQTT_QUERY,
      variables: { input: { inputs: [{ name: 'surplus', topic: 'sun/surplus', jsonPath: null, unit: 'W' }] } },
    },
    result: ok('updateConfig'),
  },
];

describe('MqttInputsCard', () => {
  it('tells the page to reload the signal descriptors after saving inputs', async () => {
    const onSaved = jest.fn();
    render(
      <Provider store={configureStore({ reducer: { mqttBrowse: mqttBrowseReducer } })}>
        <MockedProvider mocks={mocks} addTypename>
          <ChakraProvider>
            <IntlProvider locale="en" messages={flattenMessages(en)}>
              <MqttInputsCard onSaved={onSaved} />
            </IntlProvider>
          </ChakraProvider>
        </MockedProvider>
      </Provider>
    );

    await screen.findByDisplayValue('sun/surplus');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('never maps the same topic and field twice, and keeps signal names unique', async () => {
    const t = (topic, path) => ({
      __typename: 'MqttTopic', topic, sample: null, jsonPaths: [path], name: null, unit: null, jsonPath: null, value: null, lastSeen: null,
      pathValues: [{ __typename: 'MqttPathValue', path, value: '1' }],
    });
    const cached = {
      request: { query: CACHED_MQTT_TOPICS_QUERY },
      result: { data: { Mqtt: { __typename: 'MqttActions', cachedTopics: { __typename: 'MqttDiscoverOutput', error: null, result: { __typename: 'MqttDiscoverResult', ok: true, error: null, topics: [t('a/state', 'battery.soc'), t('b/state', 'battery.soc')] } } } } },
      maxUsageCount: 20,
    };
    const end = {
      request: { query: END_MQTT_BROWSE_QUERY },
      result: { data: { Mqtt: { __typename: 'MqttActions', endBrowse: { __typename: 'MqttTestOutput', error: null, result: { __typename: 'MqttTestResult', ok: true, message: null } } } } },
      maxUsageCount: 20,
    };
    render(
      <Provider store={configureStore({ reducer: { mqttBrowse: mqttBrowseReducer } })}>
        <MockedProvider mocks={[...mocks, cached, end]} addTypename>
          <ChakraProvider>
            <IntlProvider locale="en" messages={flattenMessages(en)}>
              <MqttInputsCard />
            </IntlProvider>
          </ChakraProvider>
        </MockedProvider>
      </Provider>
    );
    await screen.findByDisplayValue('sun/surplus');
    const open = () => userEvent.click(screen.getByRole('button', { name: 'Browse topics' }));

    await open();
    await userEvent.click((await screen.findAllByText(/battery\.soc = 1/))[0]);
    expect(screen.getByDisplayValue('soc')).toBeInTheDocument();

    // The same field again: disabled, nothing added.
    await open();
    const again = await screen.findAllByText(/battery\.soc = 1/);
    expect(again[0]).toBeDisabled();
    // The same field name on another topic gets a distinct signal name.
    await userEvent.click(again[1]);
    expect(screen.getByDisplayValue('soc_2')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('soc')).toHaveLength(1);
  });
});
