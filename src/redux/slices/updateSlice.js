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
  // Have we ever observed this run alive — the updater unit active, or a record
  // carrying a new run id. Until that happens, "no sign of our update" means it
  // has not started yet; afterwards it means it is over. Without the distinction
  // the client read the previous run's leftover record as this run's outcome and
  // cleared itself ~40 ms after the click, every time but the first.
  seenRunning: false,
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
      state.seenRunning = false;
      state.startedAt = new Date().toISOString();
      state.targetVersion = action.payload?.targetVersion ?? null;
      state.outcome = null;
    },
    // We have seen the updater alive. Latched, never unset for this run: it is
    // what turns a later silence from "not started" into "finished".
    updateRunObserved: (state) => {
      state.seenRunning = true;
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
  updateRunObserved,
  updateFinished,
  updateOutcomeDismissed,
  updateCleared,
} = updateSlice.actions;

export default updateSlice.reducer;
