import React, { useEffect, useState } from 'react';
import { Portal, Box, useDisclosure } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';

import Sidebar from '../sidebar/Sidebar';
import Footer from '../footer/FooterAdmin';
import Navbar from '../navbar/NavbarAdmin';
import BlockFoundCelebration from '../UI/BlockFoundCelebration';
import BackendOfflineScreen from '../UI/BackendOfflineScreen';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useSubscription, useQuery, useLazyQuery } from '@apollo/client';
import { updateNodeStats } from '../../redux/slices/nodeSlice';
import { updateMinerStats } from '../../redux/slices/minerSlice';
import { updateSoloStats } from '../../redux/slices/soloSlice';
import { updateMcuStats } from '../../redux/slices/mcuSlice';
import { updateSettings } from '../../redux/slices/settingsSlice';
import { updateServicesStatus } from '../../redux/slices/servicesSlice';
import { settingsSelector } from '../../redux/reselect/settings';
import { minerSelector } from '../../redux/reselect/miner';
import { isAuthError } from '../../redux/utils/errorUtils';
import { useDeviceType } from '../../contexts/DeviceConfigContext';
import { getRoutes } from '../../routes';
import { GET_SETTINGS_QUERY } from '../../graphql/settings';
import { MCU_UPDATE_STATUS_QUERY } from '../../graphql/mcu';
import UpdateOutcomeBanner from '../UI/UpdateOutcomeBanner';
import {
  updateFinished,
  updateOutcomeDismissed,
  updateAbandoned,
  updateRunObserved,
} from '../../redux/slices/updateSlice';
import {
  classifyUpdate,
  FINISHED,
  ABANDONED,
  NEVER_OBSERVED_BACKSTOP_MS,
} from '../../lib/updateOutcome';
import { useWsConnectionStatus } from '../../lib/useWsConnectionStatus';
import {
  MINER_SUBSCRIPTION,
  NODE_SUBSCRIPTION,
  MCU_SUBSCRIPTION,
  SOLO_SUBSCRIPTION,
  SERVICES_SUBSCRIPTION,
  SETTINGS_SUBSCRIPTION,
} from '../../graphql/subscriptions';

// How often to ask the device what its update is doing. There is no deadline:
// the device itself says whether the updater is still running, so waiting ends
// when it stops rather than when a timer we invented expires. The previous fixed
// window started at the CLICK — everything before the API is even stopped had to
// fit inside it — so a slow first update (apt, cosign download, 40 MB, unpack)
// disarmed the whole mechanism and then told the user to reboot mid-swap.
const OUTCOME_POLL_MS = 4000;

const createSerializableError = (error) => {
  if (!error) return null;
  return {
    message: error.message || 'Unknown error',
    operationName: error.operation?.operationName || 'Unknown operation',
    timestamp: new Date().toISOString()
  };
};

const Layout = ({ children }) => {
  const { onOpen } = useDisclosure();
  const dispatch = useDispatch();
  const deviceType = useDeviceType();
  const wsStatus = useWsConnectionStatus();

  // An update this browser started. Kept in redux and persisted because the
  // updater stops apollo-api: the layout below is replaced by the offline screen
  // and everything under it unmounts, so component state cannot survive the one
  // window we most need to remember.
  const {
    inProgress: updateInProgress,
    previousRunId: updatePreviousRunId,
    seenRunning: updateSeenRunning,
    startedAt: updateStartedAt,
    outcome: updateOutcome,
  } = useSelector((state) => state.update, shallowEqual);

  const [fetchUpdateStatus] = useLazyQuery(MCU_UPDATE_STATUS_QUERY, {
    fetchPolicy: 'network-only',
  });

  // Whether an update could still be running, as opposed to whether we are still
  // waiting for one.
  //
  // Both dispatches that clear `inProgress` sit inside the poll, which is gated
  // on the WS being online — so a device that never comes back can never clear
  // it, and the slice is persisted, so every reload brings it back. The offline
  // screen then keeps saying "Update in progress, do not power off" and, worse,
  // suppresses its whole troubleshooting block including "try rebooting your
  // device" — at the one moment rebooting is the correct action, forever, with
  // no way out from the UI.
  //
  // Time-bounded here rather than in the slice: this is a claim about the world
  // ("the updater is plausibly still working"), and after long enough it is
  // simply false, whatever we last managed to observe.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!updateInProgress) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, [updateInProgress]);
  const updateStillPlausible =
    updateInProgress &&
    (!updateStartedAt ||
      now - new Date(updateStartedAt).getTime() < NEVER_OBSERVED_BACKSTOP_MS);

  // Ask the device what happened while we could not see it, and keep asking for
  // as long as IT says the updater is running.
  //
  // The answer does not exist when we first can ask: the updater starts the API,
  // then the node and the miner, then runs the health check, and only then knows
  // whether the release is kept. Measured on hardware, the API was reachable 40
  // seconds before the record was written.
  useEffect(() => {
    if (wsStatus !== 'online' || !updateInProgress) return undefined;
    let cancelled = false;
    let timer;

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data } = await fetchUpdateStatus();
        const status = data?.Mcu?.updateStatus?.result;

        const outcome = classifyUpdate({
          running: Boolean(status?.running),
          record: status?.record,
          previousRunId: updatePreviousRunId,
          seenRunning: updateSeenRunning,
          elapsedMs: updateStartedAt
            ? Date.now() - new Date(updateStartedAt).getTime()
            : 0,
        });

        // Latch first: this poll may be the only one that catches the unit up.
        if (outcome.seenRunning && !updateSeenRunning) {
          dispatch(updateRunObserved());
        }
        if (outcome.kind === FINISHED) {
          dispatch(updateFinished(outcome.record));
          return;
        }
        if (outcome.kind === ABANDONED) {
          // Reported, not silently forgotten, and without resetting the slice
          // the still-mounted modal reads from.
          dispatch(updateAbandoned());
          return;
        }
      } catch (err) {
        // Still coming up, or a transient failure — try again.
      }
      if (!cancelled) timer = setTimeout(poll, OUTCOME_POLL_MS);
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    wsStatus,
    updateInProgress,
    updatePreviousRunId,
    updateSeenRunning,
    updateStartedAt,
    fetchUpdateStatus,
    dispatch,
  ]);

  // Generate routes dynamically based on device type
  const dynamicRoutes = getRoutes(deviceType || 'miner');
  let routes = dynamicRoutes;

  // ---------------------------------------------------------------------------
  // Miner subscription — skip for solo-node devices
  // ---------------------------------------------------------------------------
  const {
    loading: loadingMiner,
    error: errorMiner,
    data: dataMiner,
  } = useSubscription(MINER_SUBSCRIPTION, {
    skip: typeof window === 'undefined' || !deviceType || deviceType === 'solo-node',
  });

  useEffect(() => {
    if (!deviceType || deviceType === 'solo-node') return;

    const safeData = dataMiner ? {
      Miner: {
        stats: dataMiner.miner?.stats
          ? {
              ...dataMiner.miner.stats,
              result: dataMiner.miner.stats.result
                ? {
                    ...dataMiner.miner.stats.result,
                    stats: dataMiner.miner.stats.result.stats,
                  }
                : null,
            }
          : null,
        online: dataMiner.miner?.online ?? null,
      },
    } : null;

    dispatch(
      updateMinerStats({
        loading: loadingMiner,
        error: createSerializableError(errorMiner),
        data: safeData,
      })
    );
  }, [loadingMiner, errorMiner, dataMiner, dispatch, deviceType]);

  // ---------------------------------------------------------------------------
  // Solo subscription
  // ---------------------------------------------------------------------------
  const {
    loading: loadingSolo,
    error: errorSolo,
    data: dataSolo,
  } = useSubscription(SOLO_SUBSCRIPTION, {
    skip: typeof window === 'undefined',
  });

  useEffect(() => {
    dispatch(
      updateSoloStats({
        loading: loadingSolo,
        error: createSerializableError(errorSolo),
        // re-wrap to match { Solo: { stats: SoloStatsOutput } }
        data: dataSolo ? { Solo: { stats: dataSolo.solo } } : null,
      })
    );
  }, [loadingSolo, errorSolo, dataSolo, dispatch]);

  // ---------------------------------------------------------------------------
  // MCU subscription
  // ---------------------------------------------------------------------------
  const {
    loading: loadingMcu,
    error: errorMcu,
    data: dataMcu,
  } = useSubscription(MCU_SUBSCRIPTION, {
    skip: typeof window === 'undefined',
  });

  useEffect(() => {
    if (dataMcu || (errorMcu && !isAuthError(errorMcu))) {
      dispatch(
        updateMcuStats({
          loading: loadingMcu,
          error: createSerializableError(errorMcu),
          // re-wrap to match { Mcu: { stats: McuStatsOutput } }
          data: dataMcu ? { Mcu: { stats: dataMcu.mcu } } : null,
        })
      );
    }
  }, [loadingMcu, errorMcu, dataMcu, dispatch]);

  // ---------------------------------------------------------------------------
  // Node subscription
  // ---------------------------------------------------------------------------
  const {
    loading: loadingNode,
    error: errorNode,
    data: dataNode,
  } = useSubscription(NODE_SUBSCRIPTION, {
    skip: typeof window === 'undefined',
  });

  useEffect(() => {
    if (dataNode || (errorNode && !isAuthError(errorNode))) {
      dispatch(
        updateNodeStats({
          loading: loadingNode,
          error: createSerializableError(errorNode),
          // re-wrap to match { Node: { stats: NodeStatsOutput } }
          data: dataNode ? { Node: { stats: dataNode.node } } : null,
        })
      );
    }
  }, [loadingNode, errorNode, dataNode, dispatch]);

  // ---------------------------------------------------------------------------
  // Settings — initial fetch via query, then live updates via subscription
  // ---------------------------------------------------------------------------

  // One-shot query to populate settings immediately on mount (subscription only
  // fires when settings are mutated, so it cannot serve the initial load).
  const {
    loading: loadingSettingsQuery,
    error: errorSettingsQuery,
    data: dataSettingsQuery,
  } = useQuery(GET_SETTINGS_QUERY, {
    fetchPolicy: 'network-only',
    skip: typeof window === 'undefined',
  });

  useEffect(() => {
    if (dataSettingsQuery || (errorSettingsQuery && !isAuthError(errorSettingsQuery))) {
      dispatch(
        updateSettings({
          loading: loadingSettingsQuery,
          error: createSerializableError(errorSettingsQuery),
          // GET_SETTINGS_QUERY returns { Settings: { read: SettingsUpdateOutput } }
          data: dataSettingsQuery ?? null,
        })
      );
    }
  }, [loadingSettingsQuery, errorSettingsQuery, dataSettingsQuery, dispatch]);

  // Subscription picks up any subsequent settings changes (e.g. from another tab/device)
  const {
    data: dataSettingsSub,
    error: errorSettingsSub,
  } = useSubscription(SETTINGS_SUBSCRIPTION, {
    skip: typeof window === 'undefined',
  });

  useEffect(() => {
    if (dataSettingsSub) {
      dispatch(
        updateSettings({
          loading: false,
          error: createSerializableError(errorSettingsSub),
          data: { Settings: { read: dataSettingsSub.settings } },
        })
      );
    }
  }, [dataSettingsSub, errorSettingsSub, dispatch]);

  // ---------------------------------------------------------------------------
  // Services subscription
  // ---------------------------------------------------------------------------
  const {
    loading: loadingServices,
    error: errorServices,
    data: dataServices,
  } = useSubscription(SERVICES_SUBSCRIPTION, {
    skip: typeof window === 'undefined',
  });

  useEffect(() => {
    if (dataServices || (errorServices && !isAuthError(errorServices))) {
      dispatch(
        updateServicesStatus({
          loading: loadingServices,
          error: createSerializableError(errorServices),
          // re-wrap to match { Services: { stats: StatusOutput } }
          data: dataServices ? { Services: { stats: dataServices.services } } : null,
        })
      );
    }
  }, [loadingServices, errorServices, dataServices, dispatch]);

  // ---------------------------------------------------------------------------
  // Derived state for routing and UI
  // ---------------------------------------------------------------------------
  const {
    data: { nodeEnableSoloMining },
  } = useSelector(settingsSelector, shallowEqual);

  const { data: minerData } = useSelector(minerSelector, shallowEqual);
  // data.stats can be `false` when there are errors, so use optional access
  const blockFound = minerData?.stats?.blockFound ?? null;

  routes = routes.filter((route) => {
    if (route.path === '/solo-mining' && deviceType !== 'solo-node' && !nodeEnableSoloMining) return false;
    return true;
  });

  const { status } = useSession();
  if (status === 'loading' || status === 'unauthenticated') return <></>;

  // Show the full-screen offline overlay when the WS connection is completely lost.
  // The 'connecting' state is transient (retry in progress) so we only block on 'offline'.
  if (wsStatus === 'offline') {
    return (
      <BackendOfflineScreen
        onRetry={() => window.location.reload()}
        updating={updateStillPlausible}
      />
    );
  }

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
      }}
    >
      <Box>
        <Sidebar routes={routes} display="none" />
        <Box
          float="right"
          height="100%"
          overflowX="hidden"
          overflowY="auto"
          position="relative"
          maxHeight="100%"
          w={{ base: '100%', xl: 'calc( 100% - 190px )' }}
          maxWidth={{ base: '100%', xl: 'calc( 100% - 190px )' }}
          transition="all 0.33s cubic-bezier(0.685, 0.0473, 0.346, 1)"
          transitionDuration=".2s, .2s, .35s"
          transitionProperty="top, bottom, width"
          transitionTimingFunction="linear, linear, ease"
        >
          <Portal>
            <Box>
              <Navbar
                onOpen={onOpen}
                secondary={true}
                fixed={true}
                routes={routes}
              />
            </Box>
          </Portal>

          {blockFound && (
            <Box
              mx="auto"
              px={{ base: '20px', md: '30px' }}
              pt={{ base: '150px', md: '70px' }}
            >
              <BlockFoundCelebration blockFound={blockFound} />
            </Box>
          )}

          <Box
            mx="auto"
            p={{ base: '20px', md: '30px' }}
            pe="20px"
            minH="90vh"
            pt="50px"
          >
            <Box pt={!blockFound && { base: '130px', md: '80px', xl: '80px' }}>
              {/* Above the page content, on every page: nobody watches the screen
                  for the minutes an update takes, and a rollback is the one thing
                  they must not miss. */}
              <UpdateOutcomeBanner
                outcome={updateOutcome}
                onDismiss={() => dispatch(updateOutcomeDismissed())}
              />
              {React.cloneElement(children)}
            </Box>
          </Box>
          <Box>
            <Footer />
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
};

export default Layout;
