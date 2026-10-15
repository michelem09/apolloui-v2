import { gql } from '@apollo/client';
import { ERROR_FRAGMENT } from './fragments/error';

export const GET_SETTINGS_QUERY = gql`
  ${ERROR_FRAGMENT}
  query GET_SETTINGS {
    Settings {
      read {
        result {
          settings {
            agree
            minerMode
            voltage
            frequency
            fan_low
            fan_high
            minerHashrate
            fanTemp
            fanPwm
            apiAllow
            customApproval
            connectedWifi
            leftSidebarVisibility
            leftSidebarExtended
            rightSidebarVisibility
            temperatureUnit
            powerLedOff
            nodeEnableTor
            nodeUserConf
            nodeEnableSoloMining
            nodeMaxConnections
            nodeAllowLan
            btcsig
            nodeSoftware
            startdiff
            mindiff
          }
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

// A mutation: a query is re-executed by Apollo on a re-render.
export const SET_SETTINGS_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation SET_SETTINGS($input: SettingsUpdateInput!) {
    Settings {
      update(input: $input) {
        result {
          settings {
            agree
            minerMode
            voltage
            frequency
            fan_low
            fan_high
            minerHashrate
            fanTemp
            fanPwm
            apiAllow
            customApproval
            connectedWifi
            leftSidebarVisibility
            leftSidebarExtended
            rightSidebarVisibility
            temperatureUnit
            powerLedOff
            nodeEnableTor
            nodeUserConf
            nodeEnableSoloMining
            nodeMaxConnections
            nodeAllowLan
            btcsig
            nodeSoftware
            startdiff
            mindiff
          }
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

export const initialState = {
  Settings: {
    read: {
      result: {
        settings: {
          agree: null,
          minerMode: null,
          voltage: null,
          frequency: null,
          fan_low: null,
          fan_high: null,
          minerHashrate: null,
          fanTemp: null,
          fanPwm: null,
          apiAllow: null,
          customApproval: null,
          connectedWifi: null,
          leftSidebarVisibility: null,
          leftSidebarExtended: null,
          rightSidebarVisibility: null,
          temperatureUnit: null,
          powerLedOff: null,
          nodeEnableTor: null,
          nodeUserConf: null,
          nodeEnableSoloMining: null,
          nodeMaxConnections: null,
          nodeAllowLan: null,
          btcsig: null,
          nodeSoftware: null,
          startdiff: null,
          mindiff: null,
        },
      },
    },
  },
};
