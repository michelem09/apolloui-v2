import { callFailure, serviceFailureIdOf } from './callFailure';
import { sendFeedback } from '../redux/slices/feedbackSlice';

// The restart a Settings save asks for. On v2.2 only the miner is restarted from
// here: the backend applies node and solo (ckpool) changes itself when the
// settings are saved (settings._applyServiceLifecycle), so asking for those as
// well would restart the same service twice.
//
// Says nothing for a restart that was accepted: its progress and its arrival are
// announced by StatusTransitionFeedback from the service status, and a
// "Restarting ..." of our own on top of "Starting ..." is the same news twice.
// A refused one is reported (in the user's language when the backend says which
// service action it was), since the status never shows that.
//
// Returns true when the restart that was asked for went through (or none was).
export const runRestarts = async ({ type, restartMiner, dispatch }) => {
  if (type !== 'miner' && type !== 'both') return true;
  const result = await restartMiner();
  const failure = callFailure(result);
  if (!failure) return true;
  dispatch(sendFeedback({ message: failure, messageId: serviceFailureIdOf(result), type: 'error' }));
  return false;
};

// A miner the user stopped is not restarted by a save: "restart" is a systemctl
// restart, which would start it. Only the monitor's own `offline` counts as
// stopped, plus a `pending` one that was asked to go offline (the stop is under
// way: a restart would bring it back). No answer yet, `pending` towards online (a
// starting miner must still pick up the new config), `online` and `error` all
// restart. The settings are written either way (settings.update regenerates
// miner_config on every save), so a stopped miner reads them on its next start.
export const serviceKnownStopped = (service) =>
  service?.status === 'offline' ||
  (service?.status === 'pending' && service?.requestedStatus === 'offline');

// Fields that end up on the miner's command line (miner_config). The binary reads
// them once, at startup. On a Solo Node the only one editable is the pool (the
// payout address is its username); `nodeEnableSoloMining` leaves miner_config
// untouched there, so it must not restart a USB miner.
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

// A USB miner is "present" on a Solo Node if the live board list has one
// (`hasUsbMiners` from the device config), or the monitor has it running, or a
// start was explicitly asked for. Without any of these apollo-miner.service just
// idles (pending, requestedStatus null, or offline): nothing to restart, nothing
// to tell the user.
export const usbMinerPresent = ({ hasUsbMiners, minerService }) =>
  !!hasUsbMiners ||
  minerService?.status === 'online' ||
  (minerService?.status === 'pending' && minerService?.requestedStatus === 'online');

// What a save asks this page to restart: 'miner', 'node' or 'both' (null for
// nothing). Node and ckpool are restarted by the backend itself on v2.2
// (settings._applyServiceLifecycle, which also leaves a stopped one alone), so a
// node change only labels the button and a ckpool restart is never asked for here
// — in particular not for a wallet change, since ckpool runs btcsolo and takes the
// payout address from the miner's username.
//
// On a Solo Node the "miner" is a USB miner plugged into the box, pointed at the
// local ckpool with the payout address as its username: it keeps mining to the old
// address until restarted. With one present the ordinary rule applies (restart it
// unless it is known stopped); with none the miner is left alone.
//
// ckpool is never restarted from here (the backend does it, and leaves a stopped
// one alone), but a stopped one will not have read the new conf: `soloFieldsChanged`
// (btcsig/startdiff/mindiff, with solo mining on) plus a solo service the monitor
// knows is stopped (same rule as the miner) is reported as skipped 'solo'. The
// miner wins when both apply, as on 2.1.4: one message at a time.
//
// `skipped` is set only when a startup field really changed and the service is
// stopped, the one case worth telling the user.
export const restartPlanFor = ({
  deviceType,
  minerFieldsChanged,
  soloFieldsChanged,
  nodeNeeded,
  minerService,
  soloService,
  hasUsbMiners,
}) => {
  const isSoloNode = deviceType === 'solo-node';
  const minerApplies = !isSoloNode || usbMinerPresent({ hasUsbMiners, minerService });
  const minerChanged = minerApplies && !!minerFieldsChanged;
  const minerStopped = minerChanged && serviceKnownStopped(minerService);
  const minerRestart = minerChanged && !minerStopped;
  const soloStopped = !!soloFieldsChanged && serviceKnownStopped(soloService);
  const skipped = minerStopped ? 'miner' : soloStopped ? 'solo' : null;
  if (minerRestart && nodeNeeded) return { type: 'both', skipped };
  if (minerRestart) return { type: 'miner', skipped };
  if (nodeNeeded) return { type: 'node', skipped };
  return { type: null, skipped };
};

// The intl id of the success toast when a restart was skipped; null leaves the
// plain "Settings saved." literal the page has always sent.
export const savedMessageIdFor = (skipped) =>
  skipped === 'miner'
    ? 'settings.actions.saved_miner_stopped'
    : skipped === 'solo'
      ? 'settings.actions.saved_solo_stopped'
      : null;
