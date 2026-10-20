import { createSlice } from '@reduxjs/toolkit';
import { markAnswered } from '../utils/answered';
import { serializeError } from '../utils/errorUtils';

// The live list of boards (internal and USB). `received` matters more here than
// elsewhere: an empty list is a real answer on a Solo Node with nothing plugged
// in, and it must not be confused with "the first push has not landed yet",
// which decides whether the miner UI is shown at all.
const initialState = {
  data: null,
  received: false,
  loading: false,
  error: null,
};

const minerBoardsSlice = createSlice({
  name: 'minerBoards',
  initialState,
  reducers: {
    updateMinerBoards: (state, action) => {
      markAnswered(state, action.payload);
      state.data = action.payload.data;
      state.loading = action.payload.loading;
      state.error = serializeError(action.payload.error);
    },
  },
});

export const { updateMinerBoards } = minerBoardsSlice.actions;
export default minerBoardsSlice.reducer;
