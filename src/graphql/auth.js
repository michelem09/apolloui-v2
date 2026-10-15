import { gql } from '@apollo/client';
import { ERROR_FRAGMENT } from './fragments/error';

export const AUTH_LOGIN_QUERY = gql`
  ${ERROR_FRAGMENT}
  query Auth ($input: AuthLoginInput!) {
    Auth {
      login (input: $input) {
        result {
          accessToken
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

export const AUTH_STATUS_QUERY = gql`
  ${ERROR_FRAGMENT}
  query Auth {
    Auth {
      status {
        result {
          status
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

// Writes are mutations: a query is re-executed by Apollo on a re-render.
export const SAVE_SETUP_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation SAVE_SETUP ($input: AuthSetupInput!) {
    Auth {
      setup (input: $input) {
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

export const CHANGE_PASSWORD_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation CHANGE_PASSWORD ($input: AuthChangePasswordInput!) {
    Auth {
      changePassword (input: $input) {
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;
