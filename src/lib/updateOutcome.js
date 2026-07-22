// What a client waiting on an update should conclude from the device's answer.
//
// One function, because there are two clients — the modal, which shows progress
// and the result, and the layout, which owns the persisted state and the outcome
// banner — and when they each carried their own copy of this reasoning they
// disagreed. The modal branched on `record.state` alone and declared "Done!"
// ~50 ms after the click, off the PREVIOUS run's record; the layout compared run
// ids but could not tell "the updater has not started yet" from "the updater is
// gone", so it dispatched updateCleared() on the same leftover and disarmed
// everything: no banner for a success, none for a recovery-failed, and the
// offline screen came up telling the user to reboot mid-swap.
//
// Both were the same missing distinction. A run id that equals the one we saw
// when we pressed says nothing about our update — not that it succeeded, not
// that it failed, not that it is gone. Only two things are evidence: a run id we
// have not seen before, or having watched the unit be alive.

export const WAITING = 'waiting'; // our run has not shown up yet — keep waiting
export const RUNNING = 'running'; // it is alive
export const FINISHED = 'finished'; // it ended and said how
export const ABANDONED = 'abandoned'; // it ended without saying anything

// Only for the case where polling started after the updater had already exited,
// so `seenRunning` can never become true and no record of ours will ever appear.
// Deliberately far longer than any plausible update: it is a backstop against
// waiting forever, not a timeout on the update. A live run sets seenRunning
// within one poll, which switches this off entirely.
export const NEVER_OBSERVED_BACKSTOP_MS = 30 * 60 * 1000;

const isTerminal = (record) => Boolean(record) && record.state !== 'running';

/**
 * @param {object}  args
 * @param {boolean} args.running        systemd says the updater unit is active
 * @param {?object} args.record         the device's last-update record, or null
 * @param {?string} args.previousRunId  the run id present when we pressed Update
 * @param {boolean} args.seenRunning    have we ever observed this run alive
 * @param {number}  [args.elapsedMs]    since we pressed
 * @returns {{kind: string, record: ?object, seenRunning: boolean}}
 */
export function classifyUpdate({
  running,
  record,
  previousRunId,
  seenRunning = false,
  elapsedMs = 0,
}) {
  // A record whose run id differs from the one we started against is ours: it is
  // the only thing on the device that can say so without consulting a clock,
  // which matters because these boards have no RTC.
  const isOurs = Boolean(record?.runId) && record.runId !== previousRunId;

  // Terminal and ours: the answer, whether or not we ever caught it running (a
  // short run can slip entirely between two polls).
  if (isOurs && isTerminal(record)) {
    return { kind: FINISHED, record, seenRunning: true };
  }

  // Alive — either systemd says so, or our own record does.
  if (running || (isOurs && record.state === 'running')) {
    return { kind: RUNNING, record: null, seenRunning: true };
  }

  // Not alive. If we ever saw it alive, it is over, and since nothing of ours is
  // on disk it went without recording anything: killed before its trap was
  // installed, or unable to write (write_state is a no-op until jq exists, which
  // is exactly the state of every device taking its first OTA).
  if (seenRunning) {
    return { kind: ABANDONED, record: null, seenRunning: true };
  }

  // Never seen alive. Normally this is the gap between the click and systemd-run
  // — keep waiting. The backstop only catches the case where we started looking
  // too late to ever see it.
  if (elapsedMs >= NEVER_OBSERVED_BACKSTOP_MS) {
    return { kind: ABANDONED, record: null, seenRunning: false };
  }

  return { kind: WAITING, record: null, seenRunning: false };
}

/**
 * Whether pressing Update is safe right now.
 *
 * A second press during a live run captures the IN-FLIGHT run's id as
 * "previous", after which that run's own outcome can never be recognised as
 * ours — including `recovery-failed`, the one state that means the device needs
 * someone to SSH in. The second run would not even happen: systemd-run refuses a
 * unit name that already exists, and exits before the trap that records why.
 */
export function canStartUpdate({ running, record }) {
  if (running) return false;
  if (record && record.state === 'running') return false;
  return true;
}
