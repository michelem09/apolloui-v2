import { createSelector } from 'reselect';
import { loadingUntilAnswered } from '../utils/answered';

const dataSelector = (state) => state.minerBoards.data;
const errorSelector = (state) => state.minerBoards.error;
const receivedSelector = (state) => !!state.minerBoards.received;
const loadingSelector = (state) => loadingUntilAnswered(state.minerBoards);

const NO_BOARDS = [];

// `live` is true only once a payload with a result has arrived. Until then the
// counters below are placeholders, and callers that need to decide something
// (the device config context) must look at `live` rather than at `hasMiner`.
export const minerBoardsSelector = createSelector(
  dataSelector,
  errorSelector,
  receivedSelector,
  loadingSelector,
  (data, error, received, loading) => {
    const result = data?.result ?? null;
    const errors = [error, data?.error].filter(Boolean);
    return {
      loading,
      received,
      live: !!result,
      error: errors,
      boards: result?.boards ?? NO_BOARDS,
      hasMiner: !!result?.hasMiner,
      hasUsbMiners: !!result?.hasUsbMiners,
      usbCount: result?.usbCount ?? 0,
      usbActiveCount: result?.usbActiveCount ?? 0,
      deviceFamily: result?.deviceFamily ?? null,
    };
  }
);
