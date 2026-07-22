import { createSlice } from '@reduxjs/toolkit';

// State about an update the USER started from this browser.
//
// It is persisted, and it lives here rather than inside NavbarUpdateModal, because
// the updater stops apollo-api: the websocket drops, Default.js swaps the whole
// layout for the offline screen, and every component below it — the modal
// included — unmounts. Component state does not survive that, so the browser
// forgot it had ever started an update and came back showing a bare "backend
// offline" with no explanation.
const initialState = {
  // An update we started and have not yet seen the outcome of.
  inProgress: false,
  // The run id the device reported when we pressed Update — or null if it had
  // never updated. Our outcome is the first record carrying a DIFFERENT one.
  //
  // This replaces comparing the browser's clock against the device's. These
  // boards have no RTC, their clock is known to ship wrong, and the minutes right
  // after an update are exactly when NTP has not converged: a device behind the
  // browser rejected its own record, a device ahead accepted the previous one.
  previousRunId: null,
  startedAt: null,
  targetVersion: null,
  // The outcome once observed, shown until the user dismisses it.
  outcome: null,
};

export const updateSlice = createSlice({
  name: 'update',
  initialState,
  reducers: {
    updateStarted: (state, action) => {
      state.inProgress = true;
      state.previousRunId = action.payload?.previousRunId ?? null;
      state.startedAt = new Date().toISOString();
      state.targetVersion = action.payload?.targetVersion ?? null;
      state.outcome = null;
    },
    // The device reported what happened. Keeps inProgress false from here on, so
    // a reconnect does not re-enter the waiting state.
    updateFinished: (state, action) => {
      state.inProgress = false;
      state.outcome = action.payload ?? null;
    },
    // The user acknowledged the banner.
    updateOutcomeDismissed: (state) => {
      state.outcome = null;
    },
    // Escape hatch: the update was abandoned (browser closed and reopened much
    // later, device reflashed…) so the UI does not wait forever.
    updateCleared: () => initialState,
  },
});

export const {
  updateStarted,
  updateFinished,
  updateOutcomeDismissed,
  updateCleared,
} = updateSlice.actions;

export default updateSlice.reducer;
