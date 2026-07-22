import reducer, {
  updateStarted,
  updateRunObserved,
  updateAbandoned,
  updateFinished,
} from './updateSlice';
import { classifyUpdate, FINISHED, ABANDONED } from '../../lib/updateOutcome';

// The layout writes this slice; the modal reads it. They stay mounted together,
// so anything the layout resets is re-read by the modal on the same tick — which
// is how a reset meant to end the wait became a false "Done!".
describe('update slice, as the two components share it', () => {
  const R_OLD = { runId: 'R_OLD', state: 'succeeded', progress: 100, to: '2.2.0' };

  const started = () =>
    reducer(undefined, updateStarted({ targetVersion: '2.3.0', previousRunId: 'R_OLD' }));

  it('does not let an abandoned run turn the stale record into our success', () => {
    // What used to happen: updateCleared() reset the slice, previousRunId became
    // null, and the modal — still mounted, still holding the cached R_OLD —
    // re-ran its effect. Any run id differs from null, so the PREVIOUS run's
    // terminal record became "ours" and the modal showed "Done! / Reload App"
    // for an update that had vanished.
    const live = reducer(started(), updateRunObserved());
    expect(classifyUpdate({
      running: false,
      record: R_OLD,
      previousRunId: live.previousRunId,
      seenRunning: live.seenRunning,
    }).kind).toBe(ABANDONED);

    const after = reducer(live, updateAbandoned());

    // The discriminator survives, so the modal reaches the same conclusion the
    // layout did rather than the opposite one.
    expect(after.previousRunId).toBe('R_OLD');
    const asModalSeesIt = classifyUpdate({
      running: false,
      record: R_OLD,
      previousRunId: after.previousRunId,
      seenRunning: after.seenRunning,
    });
    expect(asModalSeesIt.kind).not.toBe(FINISHED);
  });

  it('reports an abandoned run instead of forgetting it', () => {
    // The banner is the only reporter that survives an update: the modal is
    // component state and the layout swaps the whole tree for the offline screen
    // mid-update, so the modal unmounts and comes back with nothing. A run that
    // ends without a record is exactly the case this mechanism was built for —
    // it must not be the one case that says nothing.
    const after = reducer(reducer(started(), updateRunObserved()), updateAbandoned());
    expect(after.inProgress).toBe(false);
    expect(after.outcome).toEqual({ state: 'abandoned' });
  });

  it('still stops waiting', () => {
    const after = reducer(started(), updateAbandoned());
    expect(after.inProgress).toBe(false);
  });

  it('records a real outcome unchanged', () => {
    const record = { runId: 'R_NEW', state: 'rolled-back', from: '2.2.0', to: '2.3.0' };
    const after = reducer(started(), updateFinished(record));
    expect(after.inProgress).toBe(false);
    expect(after.outcome).toBe(record);
  });
});
