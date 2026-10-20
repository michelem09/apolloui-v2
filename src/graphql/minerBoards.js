import { gql } from '@apollo/client';
import { MINER_BOARDS_FRAGMENT } from './fragments/minerBoards';

export const MINER_BOARDS_QUERY = gql`
  ${MINER_BOARDS_FRAGMENT}
  query MINER_BOARDS {
    Miner {
      boards {
        ...MinerBoardsFragment
      }
    }
  }
`;

export const MINER_BOARDS_SUBSCRIPTION = gql`
  ${MINER_BOARDS_FRAGMENT}
  subscription MINER_BOARDS_SUB {
    minerBoards {
      ...MinerBoardsFragment
    }
  }
`;
