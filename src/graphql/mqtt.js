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

// A mutation, not a query: a re-render must never re-save the config.
export const SET_MQTT_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation SET_MQTT($input: MqttConfigInput!) {
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

// Topics the device's broker connection has already seen — instant, no scan, and a
// pure read: it does not keep the browse session alive (RENEW_MQTT_BROWSE does).
export const CACHED_MQTT_TOPICS_QUERY = gql`
  ${ERROR_FRAGMENT}
  query CACHED_MQTT_TOPICS {
    Mqtt {
      cachedTopics {
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

// Start or renew the browse session: while it lives the device listens to
// everything on the broker. The modal calls it on open and on every poll.
export const RENEW_MQTT_BROWSE_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation RENEW_MQTT_BROWSE {
    Mqtt {
      renewBrowse {
        result { ok message }
        error { ...ErrorFragment }
      }
    }
  }
`;

// The browse modal closed: the device stops listening to everything on the broker.
export const END_MQTT_BROWSE_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation END_MQTT_BROWSE {
    Mqtt {
      endBrowse {
        result { ok message }
        error { ...ErrorFragment }
      }
    }
  }
`;
