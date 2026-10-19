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
  it.each(['miner', 'solo', 'node', 'both'])('a successful %s restart says nothing at all', async (type) => {
    const args = make({ type });
    expect(await runRestarts(args)).toBe(true);
    // Not "Restarting ...": StatusTransitionFeedback announces the transition.
    expect(args.dispatch).not.toHaveBeenCalled();
  });

  it('restarts what the change needs, in order', async () => {
    const args = make({ type: 'both' });
    await runRestarts(args);
    expect(args.restartMiner).toHaveBeenCalledTimes(1);
    expect(args.restartNode).toHaveBeenCalledTimes(1);
    expect(args.restartSolo).not.toHaveBeenCalled();

    const solo = make({ type: 'both', deviceType: 'solo-node' });
    await runRestarts(solo);
    expect(solo.restartSolo).toHaveBeenCalledTimes(1);
    expect(solo.restartMiner).not.toHaveBeenCalled();
  });

  it('a solo-node with a USB miner restarts ckpool, then the miner, then the node', async () => {
    const order = [];
    const step = (name) => jest.fn(async () => (order.push(name), ok));
    const args = make({
      type: 'solo+miner+node',
      deviceType: 'solo-node',
      restartSolo: step('solo'),
      restartMiner: step('miner'),
      restartNode: step('node'),
    });
    expect(await runRestarts(args)).toBe(true);
    expect(order).toEqual(['solo', 'miner', 'node']);
  });

  it('a refused step of a combined restart stops the rest', async () => {
    const args = make({
      type: 'solo+miner',
      deviceType: 'solo-node',
      restartSolo: jest.fn().mockResolvedValue(refused('solo.restart')),
    });
    expect(await runRestarts(args)).toBe(false);
    expect(args.restartMiner).not.toHaveBeenCalled();
    expect(messages(args.dispatch)[0]).toMatchObject({ messageId: 'service_error.solo.restart' });
  });

  it('a refused restart gives one localised error, and the next one is not attempted', async () => {
    const args = make({ type: 'both', restartMiner: jest.fn().mockResolvedValue(refused('miner.restart')) });
    expect(await runRestarts(args)).toBe(false);
    expect(messages(args.dispatch)).toHaveLength(1);
    expect(messages(args.dispatch)[0]).toMatchObject({ type: 'error', messageId: 'service_error.miner.restart' });
    expect(args.restartNode).not.toHaveBeenCalled();
  });

  it('nothing to restart is not a failure', async () => {
    const args = make({ type: null });
    expect(await runRestarts(args)).toBe(true);
    expect(args.dispatch).not.toHaveBeenCalled();
  });
});
