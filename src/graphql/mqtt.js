import { gql } from '@apollo/client';
import { ERROR_FRAGMENT } from './fragments/error';

const MQTT_FIELDS = `
  enabled
  host
  port
  username
  tls
  status { connected error }
  output { enabled control deviceId exports { miner node solo mcu } }
  inputs { name topic jsonPath unit }
`;

// System-level MQTT config: broker + output + input mappings. Lives in Settings →
// MQTT (broker + output) and Automation → Setup (inputs).
export const GET_MQTT_QUERY = gql`
  ${ERROR_FRAGMENT}
  query GET_MQTT {
    Mqtt {
      config {
        result { ${MQTT_FIELDS} }
        error { ...ErrorFragment }
      }
    }
  }
`;

export const SET_MQTT_QUERY = gql`
  ${ERROR_FRAGMENT}
  query SET_MQTT($input: MqttConfigInput!) {
    Mqtt {
      updateConfig(input: $input) {
        result { ${MQTT_FIELDS} }
        error { ...ErrorFragment }
      }
    }
  }
`;

export const TEST_MQTT_QUERY = gql`
  ${ERROR_FRAGMENT}
  query TEST_MQTT($input: MqttConfigInput!) {
    Mqtt {
      testConnection(input: $input) {
        result { ok message }
        error { ...ErrorFragment }
      }
    }
  }
`;

const TOPIC_FIELDS = `topic sample jsonPaths pathValues { path value } name unit jsonPath value lastSeen`;

export const DISCOVER_MQTT_QUERY = gql`
  ${ERROR_FRAGMENT}
  query DISCOVER_MQTT($input: MqttConfigInput!, $prefix: String, $seconds: Int) {
    Mqtt {
      discoverTopics(input: $input, prefix: $prefix, seconds: $seconds) {
        result {
          ok
          error
          topics { ${TOPIC_FIELDS} }
        }
        error { ...ErrorFragment }
      }
    }
  }
`;

// Topics the device's broker connection has already seen — instant, no scan.
export const CACHED_MQTT_TOPICS_QUERY = gql`
  ${ERROR_FRAGMENT}
  query CACHED_MQTT_TOPICS {
    Mqtt {
      cachedTopics(lease: true) {
        result {
          ok
          error
          topics { ${TOPIC_FIELDS} }
        }
        error { ...ErrorFragment }
      }
    }
  }
`;

// The browse modal closed: the device stops listening to everything on the broker.
export const END_MQTT_BROWSE_QUERY = gql`
  ${ERROR_FRAGMENT}
  query END_MQTT_BROWSE {
    Mqtt {
      endBrowse {
        result { ok message }
        error { ...ErrorFragment }
      }
    }
  }
`;
