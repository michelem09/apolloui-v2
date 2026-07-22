import { useEffect, useState } from 'react';
import { subscribeWsStatus } from './apolloClient';

// Tracks the WebSocket connection status from the module-level tracker in
// apolloClient.js: 'connecting' | 'online' | 'offline'.
//
// Lifted out of Default.js because a second consumer needed it. The navbar has to
// know when the backend comes BACK, not just that it went away: Apollo Client
// stops a pollInterval that hits a network error and never restarts it, so the
// version poll died silently every time the updater stopped apollo-api — which is
// precisely when a new release has just appeared. Observed on hardware: the badge
// only ever showed after a manual page reload.
export function useWsConnectionStatus() {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    return subscribeWsStatus(setStatus);
  }, []);

  return status;
}

export default useWsConnectionStatus;
