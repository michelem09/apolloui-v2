import { runRestarts } from './runRestarts';

const ok = { data: { X: { restart: { error: null } } } };
const refused = (path) => ({
  data: { X: { restart: { error: { message: 'Could not x', type: 'SERVICE_COMMAND_FAILED', path } } } },
});
const messages = (dispatch) => dispatch.mock.calls.map(([a]) => a.payload);

const make = (over = {}) => ({
  dispatch: jest.fn(),
  restartMiner: jest.fn().mockResolvedValue(ok),
  restartSolo: jest.fn().mockResolvedValue(ok),
  restartNode: jest.fn().mockResolvedValue(ok),
  deviceType: 'miner',
  ...over,
});

describe('runRestarts', () => {
  it.each(['miner', 'both'])('a successful %s restart restarts the miner and says nothing at all', async (type) => {
    const args = make({ type });
    expect(await runRestarts(args)).toBe(true);
    expect(args.restartMiner).toHaveBeenCalledTimes(1);
    // Not "Restarting ...": StatusTransitionFeedback announces the transition.
    expect(args.dispatch).not.toHaveBeenCalled();
  });

  it.each(['node', 'solo', null])('%s: the backend restarts those itself, so nothing is asked of the UI', async (type) => {
    const args = make({ type });
    expect(await runRestarts(args)).toBe(true);
    expect(args.restartMiner).not.toHaveBeenCalled();
    expect(args.restartNode).not.toHaveBeenCalled();
    expect(args.restartSolo).not.toHaveBeenCalled();
    expect(args.dispatch).not.toHaveBeenCalled();
  });

  it('a refused restart gives one localised error', async () => {
    const args = make({ type: 'both', restartMiner: jest.fn().mockResolvedValue(refused('miner.restart')) });
    expect(await runRestarts(args)).toBe(false);
    expect(messages(args.dispatch)).toHaveLength(1);
    expect(messages(args.dispatch)[0]).toMatchObject({ type: 'error', messageId: 'service_error.miner.restart' });
  });
});
