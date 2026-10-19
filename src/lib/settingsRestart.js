// What a settings save has to restart.
//
// Pulled out of the settings page because it is the one decision there that has
// been wrong in both directions. The flag is not just the button's label — it is
// also what performs the stop/start after saving — so the two failures are:
//
//   promising a restart that cannot happen (no drive, so the node is down and
//   staying down: "Save & Restart" runs a start systemd refuses)
//   skipping one that must (the storage probe can call a drive unusable while
//   bitcoind is running fine; the save then reports success and applies nothing)
//
// Both are avoided by asking whether there is a node to restart rather than
// whether the drive looks good: a running node is restarted whatever the probe
// says, and a node that is down with nowhere to live is left alone.

export const nodeRestartNeeded = ({ fieldsChanged, nodeRunning, storageUsable }) =>
  !!fieldsChanged && (!!nodeRunning || storageUsable !== false);

export const restartTypeFor = ({ miner, solo, node }) => {
  if ((miner || solo) && node) return 'both';
  if (miner) return 'miner';
  if (solo) return 'solo';
  if (node) return 'node';
  return null;
};

// A service the user stopped is not restarted by a save: "restart" is a
// systemctl restart, which would start it. Only the monitor's own `offline`
// counts as stopped, plus a `pending` one that was asked to go offline (the stop
// is under way: a restart would bring it back). No answer yet, `pending` towards
// online (a starting miner must still pick up the new config), `online` and
// `error` all restart.
// The settings are written either way (settings.update regenerates
// miner_config on every save), so a stopped service reads them on its next start.
export const serviceKnownStopped = (service) =>
  service?.status === 'offline' ||
  (service?.status === 'pending' && service?.requestedStatus === 'offline');

// Fields that end up on the miner's command line (miner_config). The binary
// reads them once, at startup. On a Solo Node the only one editable is the pool
// (the payout address is its username); `nodeEnableSoloMining` leaves
// miner_config untouched there, so it must not restart a USB miner.
const MINER_FIELDS = [
  'minerMode',
  'frequency',
  'voltage',
  'pool',
  'backupPool',
  'fan_low',
  'fan_high',
  'minerHashrate',
  'fanTemp',
  'fanPwm',
  'powerLedOff',
  'nodeEnableSoloMining',
];
export const minerRestartFieldsFor = (deviceType) =>
  deviceType === 'solo-node'
    ? MINER_FIELDS.filter((f) => f !== 'nodeEnableSoloMining')
    : MINER_FIELDS;

// What a save restarts, and which restart it skipped because the service is
// stopped. `skipped` is 'miner' | 'solo' | null and only set when a startup
// field really changed, since that is the only case worth telling the user about.
//
// On a Solo Node the "miner" is a USB miner plugged into the box, pointed at the
// local ckpool with the payout address as its username: it keeps mining to the
// old address until restarted. Whether one is there cannot be read from "stopped"
// (without one, apollo-miner.service loops in auto-restart and reports pending or
// offline all day), so it is restarted only when the monitor says `online`, i.e.
// its stat file is fresh. Anything else is left alone silently: it reads the new
// miner_config at its next start, and "your miner is stopped" would be noise on a
// box that has none.
export const restartPlanFor = ({
  deviceType,
  minerFieldsChanged,
  soloFieldsChanged,
  nodeNeeded,
  minerService,
  soloService,
}) => {
  const isSoloNode = deviceType === 'solo-node';
  const minerChanged = !isSoloNode && !!minerFieldsChanged;
  const soloChanged = isSoloNode && !!soloFieldsChanged;
  const minerStopped = minerChanged && serviceKnownStopped(minerService);
  const soloStopped = soloChanged && serviceKnownStopped(soloService);
  const usbMinerRestart =
    isSoloNode && !!minerFieldsChanged && minerService?.status === 'online';
  const soloRestart = soloChanged && !soloStopped;
  const skipped = minerStopped ? 'miner' : soloStopped ? 'solo' : null;
  if (usbMinerRestart) {
    // ckpool first, so the pool is listening when the miner reconnects.
    const steps = [soloRestart && 'solo', 'miner', nodeNeeded && 'node'].filter(Boolean);
    return { type: steps.join('+'), skipped };
  }
  return {
    type: restartTypeFor({
      miner: minerChanged && !minerStopped,
      solo: soloRestart,
      node: !!nodeNeeded,
    }),
    skipped,
  };
};

// The intl id of the success toast when a restart was skipped; null leaves the
// plain "Settings saved." literal the page has always sent.
export const savedMessageIdFor = (skipped) =>
  skipped === 'miner'
    ? 'settings.actions.saved_miner_stopped'
    : skipped === 'solo'
      ? 'settings.actions.saved_solo_stopped'
      : null;
