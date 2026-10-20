import {
  minerRestartFieldsFor,
  restartPlanFor,
  runRestarts,
  savedMessageIdFor,
  serviceKnownStopped,
  usbMinerPresent,
} from './runRestarts';

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

describe('serviceKnownStopped', () => {
  it.each([
    [{ status: 'offline' }, true],
    [{ status: 'pending', requestedStatus: 'offline' }, true],
    [{ status: 'pending', requestedStatus: 'online' }, false],
    [{ status: 'online' }, false],
    [{ status: 'error' }, false],
    [undefined, false],
  ])('%j -> %s', (service, expected) => {
    expect(serviceKnownStopped(service)).toBe(expected);
  });
});

describe('minerRestartFieldsFor', () => {
  it('a solo-node pool is a miner field, the solo switch is not', () => {
    expect(minerRestartFieldsFor('solo-node')).toContain('pool');
    expect(minerRestartFieldsFor('solo-node')).not.toContain('nodeEnableSoloMining');
    expect(minerRestartFieldsFor('miner')).toContain('nodeEnableSoloMining');
  });
});

describe('usbMinerPresent', () => {
  it.each([
    [{ hasUsbMiners: true, minerService: { status: 'offline' } }, true],
    [{ hasUsbMiners: false, minerService: { status: 'online' } }, true],
    [{ hasUsbMiners: false, minerService: { status: 'pending', requestedStatus: 'online' } }, true],
    [{ hasUsbMiners: false, minerService: { status: 'pending', requestedStatus: null } }, false],
    [{ hasUsbMiners: false, minerService: { status: 'offline' } }, false],
    [{ hasUsbMiners: false, minerService: undefined }, false],
  ])('%j -> %s', (args, expected) => {
    expect(usbMinerPresent(args)).toBe(expected);
  });
});

describe('restartPlanFor', () => {
  const base = { deviceType: 'miner', minerFieldsChanged: true, nodeNeeded: false, minerService: { status: 'online' } };

  it('restarts a running miner when a startup field changed', () => {
    expect(restartPlanFor(base)).toEqual({ type: 'miner', skipped: null });
    expect(restartPlanFor({ ...base, nodeNeeded: true })).toEqual({ type: 'both', skipped: null });
  });

  it('never asks the page for a ckpool restart, a node change only labels the button', () => {
    expect(restartPlanFor({ ...base, minerFieldsChanged: false, nodeNeeded: true })).toEqual({ type: 'node', skipped: null });
    expect(restartPlanFor({ ...base, minerFieldsChanged: false })).toEqual({ type: null, skipped: null });
  });

  it('a stopped miner is not restarted, and the save says so', () => {
    expect(restartPlanFor({ ...base, minerService: { status: 'offline' } })).toEqual({ type: null, skipped: 'miner' });
    // The node part of a combined save still goes ahead.
    expect(restartPlanFor({ ...base, minerService: { status: 'offline' }, nodeNeeded: true })).toEqual({
      type: 'node',
      skipped: 'miner',
    });
    expect(restartPlanFor({ ...base, minerService: { status: 'pending', requestedStatus: 'offline' } }).skipped).toBe('miner');
  });

  it('nothing to skip when no startup field changed, even if the miner is stopped', () => {
    expect(restartPlanFor({ ...base, minerFieldsChanged: false, minerService: { status: 'offline' } }).skipped).toBeNull();
  });

  describe('solo-node', () => {
    const solo = { ...base, deviceType: 'solo-node', hasUsbMiners: false };

    it('restarts the running USB miner on a wallet change', () => {
      expect(restartPlanFor(solo)).toEqual({ type: 'miner', skipped: null });
    });

    it('a USB miner seen at boot counts even if the monitor has it offline-by-error', () => {
      expect(restartPlanFor({ ...solo, hasUsbMiners: true, minerService: { status: 'error' } })).toEqual({
        type: 'miner',
        skipped: null,
      });
    });

    it('a stopped USB miner is not restarted, even though boot saw it (hasUsbMiners is true)', () => {
      expect(restartPlanFor({ ...solo, hasUsbMiners: true, minerService: { status: 'offline' } })).toEqual({
        type: null,
        skipped: 'miner',
      });
    });

    it('with no USB miner apollo-miner only idles: nothing to restart, nothing to tell', () => {
      expect(restartPlanFor({ ...solo, minerService: { status: 'pending', requestedStatus: null } })).toEqual({
        type: null,
        skipped: null,
      });
      expect(restartPlanFor({ ...solo, minerService: { status: 'offline' } })).toEqual({ type: null, skipped: null });
    });
  });
});

describe('restartPlanFor: a stopped solo pool', () => {
  const base = { deviceType: 'miner', minerFieldsChanged: false, soloFieldsChanged: true, nodeNeeded: false };
  const offline = { status: 'offline' };

  it('says so, and restarts nothing (the backend leaves a stopped ckpool alone)', () => {
    expect(restartPlanFor({ ...base, soloService: offline })).toEqual({ type: null, skipped: 'solo' });
  });
  it.each([['online'], ['pending'], ['error'], [undefined]])('stays silent when solo is %s', (status) => {
    expect(restartPlanFor({ ...base, soloService: status ? { status } : undefined }).skipped).toBeNull();
  });
  it('a pending stop (requested offline) counts as stopped', () => {
    expect(restartPlanFor({ ...base, soloService: { status: 'pending', requestedStatus: 'offline' } }).skipped).toBe('solo');
  });
  it('is silent when no ckpool conf field changed, even with solo stopped', () => {
    expect(restartPlanFor({ ...base, soloFieldsChanged: false, soloService: offline }).skipped).toBeNull();
  });
  it('works on a Solo Node too, and does not touch the miner restart', () => {
    expect(
      restartPlanFor({ ...base, deviceType: 'solo-node', hasUsbMiners: true, minerFieldsChanged: true, minerService: { status: 'online' }, soloService: offline })
    ).toEqual({ type: 'miner', skipped: 'solo' });
  });
  it('the stopped miner is the one reported when both are stopped', () => {
    expect(
      restartPlanFor({ ...base, minerFieldsChanged: true, minerService: offline, soloService: offline })
    ).toEqual({ type: null, skipped: 'miner' });
  });
  it('a stopped miner with an unchanged-conf, running solo does not report solo', () => {
    expect(
      restartPlanFor({ ...base, soloFieldsChanged: false, minerFieldsChanged: true, minerService: offline, soloService: offline }).skipped
    ).toBe('miner');
  });
});

describe('savedMessageIdFor', () => {
  it('names the stopped-solo toast', () => {
    expect(savedMessageIdFor('solo')).toBe('settings.actions.saved_solo_stopped');
  });
  it('names the stopped-miner toast, otherwise leaves the plain one', () => {
    expect(savedMessageIdFor('miner')).toBe('settings.actions.saved_miner_stopped');
    expect(savedMessageIdFor(null)).toBeNull();
  });
});
