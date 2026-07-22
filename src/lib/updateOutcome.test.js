import {
  classifyUpdate,
  WAITING,
  RUNNING,
  FINISHED,
  ABANDONED,
} from './updateOutcome';

// The device's answer, as the GraphQL layer hands it over.
const device = (running, record) => ({ running, record });
const rec = (runId, state) => ({ runId, state, progress: 0 });

// A device that has updated before. This is the state EVERY device is in from
// its second update onwards, and it is the one the previous implementation got
// wrong: it read this leftover as the outcome of the update just started.
const PREVIOUS = rec('RUN-0', 'succeeded');

describe('classifyUpdate', () => {
  describe('the window between the click and the updater existing', () => {
    // The updater has to clear sudo, the bash preamble, systemd-run and reach its
    // first write_state — 150-500 ms on hardware, longer if it installs jq first.
    // Both clients poll inside that window: the modal the instant its skip gate
    // opens, the layout synchronously at the end of its effect.
    it('does not read the previous run as the outcome of this one', () => {
      const { kind } = classifyUpdate({
        ...device(false, PREVIOUS),
        previousRunId: 'RUN-0',
        seenRunning: false,
      });
      expect(kind).toBe(WAITING);
    });

    it('does not read a previous FAILURE as this run failing either', () => {
      const { kind } = classifyUpdate({
        ...device(false, rec('RUN-0', 'rolled-back')),
        previousRunId: 'RUN-0',
        seenRunning: false,
      });
      expect(kind).toBe(WAITING);
    });

    it('does not give up on a device that has never updated', () => {
      // record null, unit not up yet: indistinguishable from "gone" without the
      // seenRunning latch. Giving up here disarmed the whole mechanism.
      const { kind } = classifyUpdate({
        ...device(false, null),
        previousRunId: null,
        seenRunning: false,
      });
      expect(kind).toBe(WAITING);
    });
  });

  describe('once our run exists', () => {
    it('reports the unit being up as running, before any record of ours', () => {
      const { kind, seenRunning } = classifyUpdate({
        ...device(true, PREVIOUS),
        previousRunId: 'RUN-0',
        seenRunning: false,
      });
      expect(kind).toBe(RUNNING);
      expect(seenRunning).toBe(true);
    });

    it('reports our own running record as running', () => {
      const { kind, seenRunning } = classifyUpdate({
        ...device(true, rec('RUN-1', 'running')),
        previousRunId: 'RUN-0',
        seenRunning: false,
      });
      expect(kind).toBe(RUNNING);
      expect(seenRunning).toBe(true);
    });

    it('returns the terminal record once the run id is a new one', () => {
      const record = rec('RUN-1', 'succeeded');
      const out = classifyUpdate({
        ...device(false, record),
        previousRunId: 'RUN-0',
        seenRunning: true,
      });
      expect(out.kind).toBe(FINISHED);
      expect(out.record).toBe(record);
    });

    it('reports recovery-failed as a terminal outcome, not as noise', () => {
      const out = classifyUpdate({
        ...device(false, rec('RUN-1', 'recovery-failed')),
        previousRunId: 'RUN-0',
        seenRunning: true,
      });
      expect(out.kind).toBe(FINISHED);
      expect(out.record.state).toBe('recovery-failed');
    });

    it('accepts a terminal record even if the poll never caught it running', () => {
      // A short update between two polls. The record is unambiguous on its own.
      const out = classifyUpdate({
        ...device(false, rec('RUN-1', 'succeeded')),
        previousRunId: 'RUN-0',
        seenRunning: false,
      });
      expect(out.kind).toBe(FINISHED);
    });
  });

  describe('the updater died without recording anything', () => {
    // The likeliest first-ever-OTA failure: write_state is a no-op until jq
    // exists, so a device whose dependency install fails records nothing at all.
    it('gives up once a run we observed is gone and left nothing of ours', () => {
      const { kind } = classifyUpdate({
        ...device(false, PREVIOUS),
        previousRunId: 'RUN-0',
        seenRunning: true,
      });
      expect(kind).toBe(ABANDONED);
    });

    it('gives up with no record at all, once the run has been observed', () => {
      const { kind } = classifyUpdate({
        ...device(false, null),
        previousRunId: null,
        seenRunning: true,
      });
      expect(kind).toBe(ABANDONED);
    });

    it('gives up after the backstop when the run was never observed at all', () => {
      // Covers the poll starting after the updater had already exited. Bounded,
      // but generous: it must never be able to cut off a live update, and a live
      // update always sets seenRunning long before this.
      const { kind } = classifyUpdate({
        ...device(false, PREVIOUS),
        previousRunId: 'RUN-0',
        seenRunning: false,
        elapsedMs: 31 * 60 * 1000,
      });
      expect(kind).toBe(ABANDONED);
    });

    it('does not apply the backstop to a run it can see is alive', () => {
      const { kind } = classifyUpdate({
        ...device(true, PREVIOUS),
        previousRunId: 'RUN-0',
        seenRunning: true,
        elapsedMs: 90 * 60 * 1000,
      });
      expect(kind).toBe(RUNNING);
    });
  });

  describe('a second press during a live run', () => {
    // The failure this exists to make impossible: capturing the IN-FLIGHT run's
    // id as "previous" blinds the client to its own outcome permanently,
    // including for the one state that means the device needs SSH.
    it('refuses to start while the device reports an update running', () => {
      expect(canStartUpdate(device(true, rec('RUN-1', 'running')))).toBe(false);
    });

    it('refuses to start while a record says a run is still going', () => {
      expect(canStartUpdate(device(false, rec('RUN-1', 'running')))).toBe(false);
    });

    it('allows a start when the last run is terminal', () => {
      expect(canStartUpdate(device(false, PREVIOUS))).toBe(true);
    });

    it('allows a start on a device that has never updated', () => {
      expect(canStartUpdate(device(false, null))).toBe(true);
    });
  });
});

// Imported down here so the describe above reads as the specification.
const { canStartUpdate } = require('./updateOutcome');
