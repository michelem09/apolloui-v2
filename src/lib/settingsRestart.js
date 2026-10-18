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

// What a save restarts, and which restart it skipped because the service is
// stopped. `skipped` is 'miner' | 'solo' | null and only set when a startup
// field really changed, since that is the only case worth telling the user about.
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
  return {
    type: restartTypeFor({
      miner: minerChanged && !minerStopped,
      solo: soloChanged && !soloStopped,
      node: !!nodeNeeded,
    }),
    skipped: minerStopped ? 'miner' : soloStopped ? 'solo' : null,
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
