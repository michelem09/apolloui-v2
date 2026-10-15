import { createSlice } from '@reduxjs/toolkit';

// State of the MQTT topic browser. It lives here and not in MqttBrowseModal
// because the modal's content unmounts on close (and the whole card with the tab):
// component state took the topic list and a running 60s scan with it. Not
// persisted — the topics themselves are cached by the backend, and a scan cannot
// outlive a page reload.
const initialState = {
  // Topics from the backend cache; null until the first load.
  topics: null,
  // Why the cache could not be read (e.g. the broker link is down).
  cacheError: null,
  // The cache read fine, but the broker refused part of what live browsing needs
  // (the # subscription): shown next to the list, which is then only what is cached.
  cacheWarning: null,
  loadedAt: null,
  // The explicit timed scan.
  scan: { running: false, startedAt: null, error: null },
  // Client-side filter text.
  filter: '',
};

export const mqttBrowseSlice = createSlice({
  name: 'mqttBrowse',
  initialState,
  reducers: {
    cacheLoaded: (state, action) => {
      state.topics = action.payload.topics;
      state.cacheError = null;
      state.cacheWarning = action.payload.warning || null;
      state.loadedAt = action.payload.loadedAt;
    },
    cacheFailed: (state, action) => {
      state.cacheError = action.payload;
    },
    scanStarted: (state, action) => {
      state.scan = { running: true, startedAt: action.payload, error: null };
    },
    scanFinished: (state) => {
      state.scan = { running: false, startedAt: null, error: null };
    },
    scanFailed: (state, action) => {
      state.scan = { running: false, startedAt: null, error: action.payload };
    },
    filterChanged: (state, action) => {
      state.filter = action.payload;
    },
  },
});

export const { cacheLoaded, cacheFailed, scanStarted, scanFinished, scanFailed, filterChanged } =
  mqttBrowseSlice.actions;

// Case-insensitive substring match on the topic, a resolved name and any jsonPath.
// Pure, so the modal and the tests share one definition of "matches".
export const filterTopics = (topics, filter) => {
  const q = String(filter || '').trim().toLowerCase();
  if (!q) return topics || [];
  return (topics || []).filter((t) =>
    [t.topic, t.name, t.jsonPath, ...(t.jsonPaths || [])].some((s) => s && String(s).toLowerCase().includes(q))
  );
};

export default mqttBrowseSlice.reducer;
