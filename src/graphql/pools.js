import { gql } from '@apollo/client';
import { ERROR_FRAGMENT } from './fragments/error';

export const GET_POOLS_QUERY = gql`
  ${ERROR_FRAGMENT}
  query GET_POOLS {
    Pool {
      list {
        result {
          pools {
            enabled
            donation
            url
            username
            password
            proxy
            index
          }
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

// Writes are mutations: a query is re-executed by Apollo on a re-render.
export const SET_POOLS_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation SET_POOLS ($input: PoolCreateInput!) {
    Pool {
      create (input: $input) {
        result {
          pool {
            enabled
            donation
            url
            username
            password
            proxy
            index
          }
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;

export const UPDATE_POOLS_MUTATION = gql`
  ${ERROR_FRAGMENT}
  mutation UPDATE_POOLS ($input: PoolUpdateAllInput!) {
    Pool {
      updateAll(input: $input) {
        result {
          pools {
            enabled
            donation
            url
            username
            password
            proxy
            index
          }
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;
