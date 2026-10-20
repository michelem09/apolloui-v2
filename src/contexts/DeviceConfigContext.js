import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { minerBoardsSelector } from '../redux/reselect/minerBoards';

/**
 * What hardware this box is, and what is attached to it, as far as the UI needs
 * to care.
 *
 * Two questions that used to share one flag are kept apart:
 *
 *   isSoloNode    the chassis is a Solo Node. Wizard, the solo switch, the solo
 *                 chart and the Solo tab hang on this; a USB miner does not
 *                 change what the box is.
 *   hasMiner      there is a miner to show: always on an Apollo, and on a Solo
 *                 Node only while a board is present (live, from the backend).
 *                 The Miner page, Start/Stop, the topbar status follow this.
 *
 * The settings screens branch on which miner the box runs internally, because the
 * two generations take different tuning options: Apollo III is a target hashrate
 * and a fan target temperature, Apollo I/II are board voltage, oscillator and a
 * fan temperature range. Hence `minerFamily` rather than a boolean — every Apollo
 * I/II has an internal miner too.
 *
 *   minerFamily          'apollo-iii' | 'legacy' | null   (null: no internal board)
 *   effectiveMinerFamily minerFamily, or 'legacy' for a Solo Node with USB boards:
 *                        USB boards always run the legacy miner_config
 *   canStartMiner  Start/Restart of the miner make sense: always on an Apollo, on a
 *                 Solo Node only with a USB board active or booting (live)
 *   startBlockedReason   null when startable; else 'stuck' (the only boards attached
 *                        are not responding) or 'none' (Solo Node, nothing usable)
 *   hasUsbMiners         USB boards are attached (live from the Miner.boards push)
 *   isHybrid             an Apollo III alongside USB boards, where a III-only
 *                        preset would not apply to everything that is mining
 */
const DeviceConfigContext = createContext(undefined);

// Chassis facts only. What is plugged in comes from the live board list.
function deriveConfig({ chassis, usbMiners }) {
  if (chassis === 'apollo-iii') {
    // miner_start.sh starts the v3 binary alone: no external boards on this one
    // unless the backend reports some.
    return { minerFamily: 'apollo-iii', hintUsbMiners: !!usbMiners };
  }
  if (chassis === 'solo-node') {
    // A node, optionally with USB miners plugged into it.
    return { minerFamily: null, hintUsbMiners: !!usbMiners };
  }
  // No chassis variable: the detection script is not run for Apollo I/II at all
  // (see rc.local), and those always have an internal board plus USB ports.
  return { minerFamily: 'legacy', hintUsbMiners: true };
}

export const DeviceConfigProvider = ({ children }) => {
  // Build-time values where there are any; the API below then replaces them with
  // what the device actually reports. Nothing here may assume a miner: the
  // device-type variable is gone from set_UI_mode.sh, so on a Solo Node an assumed
  // 'miner' would flash the miner UI (menu entry, miner subscription) until
  // /api/config answers. With the type unknown, `hasMiner` is false and the
  // layout holds its first paint (Default.js) for that one same-origin request,
  // so neither an Apollo nor a Solo Node flashes the other's UI.
  const [config, setConfig] = useState(() => ({
    deviceType:
      process.env.NEXT_PUBLIC_DEVICE_TYPE ||
      (process.env.NEXT_PUBLIC_CHASSIS === 'solo-node' ? 'solo-node' : null),
    chassis: process.env.NEXT_PUBLIC_CHASSIS || null,
    usbMiners: !!process.env.NEXT_PUBLIC_USB_MINERS,
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip API call during SSR (build time)
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          setConfig({
            deviceType: data.deviceType || 'miner',
            chassis: data.chassis || null,
            usbMiners: !!data.usbMiners,
          });
        } else {
          // Keep the build-time values rather than guessing; with none, an Apollo.
          setConfig((c) => ({ ...c, deviceType: c.deviceType || 'miner' }));
          console.warn('Failed to fetch device config from API, using fallback');
        }
      } catch (error) {
        setConfig((c) => ({ ...c, deviceType: c.deviceType || 'miner' }));
        console.error('Failed to fetch device config:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const boards = useSelector(minerBoardsSelector, shallowEqual);

  const value = useMemo(() => {
    const { minerFamily, hintUsbMiners } = deriveConfig(config);
    const isSoloNode = config.deviceType === 'solo-node';
    // Until the first payload the chassis is the only evidence: an Apollo has a
    // miner, a Solo Node is taken to have none (so the page does not flash a
    // miner UI that is about to be taken away). Once the backend has spoken, a
    // Solo Node follows it; an Apollo keeps its miner even when the board list is
    // momentarily empty (a crashed internal miner is still a miner to show).
    const hasMiner =
      config.deviceType === null ? false : isSoloNode ? boards.live && boards.hasMiner : true;
    const hasUsbMiners = boards.live ? boards.hasUsbMiners : hintUsbMiners;
    // A Solo Node has no internal miner: with no USB board plugged in there is
    // nothing to start. Not known until the board list has spoken, so the button
    // never flashes enabled and then turns off.
    // A booting board counts: the miner starts by itself when the board is ready,
    // so pressing Start meanwhile is legitimate. Stuck, disconnected and unknown
    // boards do not.
    const canStartMiner = isSoloNode
      ? boards.live && boards.usbActiveCount + boards.usbBootingCount > 0
      : true;
    // Why Start is off on a Solo Node: 'stuck' when the only attached boards are
    // not responding (so the tooltip says that), 'none' otherwise; null if startable.
    const startBlockedReason = canStartMiner
      ? null
      : boards.live && boards.usbStuckCount > 0
        ? 'stuck'
        : 'none';
    const effectiveMinerFamily = minerFamily ?? (hasUsbMiners ? 'legacy' : null);
    return {
      deviceType: config.deviceType,
      chassis: config.chassis,
      isSoloNode,
      hasMiner,
      // false until the first board list has arrived: callers that would redirect
      // or hide something on `hasMiner` alone must wait for it on a Solo Node.
      boardsLive: boards.live,
      canStartMiner,
      startBlockedReason,
      minerFamily,
      effectiveMinerFamily,
      hasUsbMiners,
      isHybrid: minerFamily === 'apollo-iii' && hasUsbMiners,
      loading,
    };
  }, [config, loading, boards.live, boards.hasMiner, boards.hasUsbMiners, boards.usbActiveCount, boards.usbBootingCount, boards.usbStuckCount]);

  return (
    <DeviceConfigContext.Provider value={value}>
      {children}
    </DeviceConfigContext.Provider>
  );
};

export const useDeviceType = () => {
  const context = useContext(DeviceConfigContext);
  if (context === undefined) {
    throw new Error('useDeviceType must be used within a DeviceConfigProvider');
  }
  return context.deviceType;
};

export const useDeviceConfig = () => {
  const context = useContext(DeviceConfigContext);
  if (context === undefined) {
    throw new Error('useDeviceConfig must be used within a DeviceConfigProvider');
  }
  return context;
};
