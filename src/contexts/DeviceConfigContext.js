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
  // Build-time values as the first paint, so the layout does not flash; the API
  // below then replaces them with what the device actually reports.
  const [config, setConfig] = useState(() => ({
    deviceType: process.env.NEXT_PUBLIC_DEVICE_TYPE || 'miner',
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
          // Keep the build-time values rather than guessing.
          console.warn('Failed to fetch device config from API, using fallback');
        }
      } catch (error) {
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
    const hasMiner = isSoloNode ? boards.live && boards.hasMiner : true;
    const hasUsbMiners = boards.live ? boards.hasUsbMiners : hintUsbMiners;
    const effectiveMinerFamily = minerFamily ?? (hasUsbMiners ? 'legacy' : null);
    return {
      deviceType: config.deviceType,
      chassis: config.chassis,
      isSoloNode,
      hasMiner,
      // false until the first board list has arrived: callers that would redirect
      // or hide something on `hasMiner` alone must wait for it on a Solo Node.
      boardsLive: boards.live,
      minerFamily,
      effectiveMinerFamily,
      hasUsbMiners,
      isHybrid: minerFamily === 'apollo-iii' && hasUsbMiners,
      loading,
    };
  }, [config, loading, boards.live, boards.hasMiner, boards.hasUsbMiners]);

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
