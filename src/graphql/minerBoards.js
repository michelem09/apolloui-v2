import { gql } from '@apollo/client';
import { ERROR_FRAGMENT } from './fragments/error';

// One entry per board the backend knows about: the internal one(s) and every USB
// board, connected or recently unplugged. Joined to the stat files by
// MinerStats.uuid === MinerBoard.id.
export const MINER_BOARDS_FRAGMENT = gql`
  ${ERROR_FRAGMENT}
  fragment MinerBoardsFragment on MinerBoardsOutput {
    result {
      boards {
        id
        uuid
        serial
        family
        kind
        port
        status
        mining
        since
        lastSeen
        expiresAt
      }
      hasMiner
      hasUsbMiners
      usbCount
      usbActiveCount
      deviceFamily
    }
    error {
      ...ErrorFragment
    }
  }
`;

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
