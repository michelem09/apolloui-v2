import { minerSelector } from './miner';

// The totals of the miner page and the topbar. A board the backend calls
// disconnected has a stat file that is stale but still on disk, and for up to a
// minute after the unplug it still looks alive: it must leave every total at once.

const statFile = (uuid, comport, hashrate, watts, temp) => ({
  uuid,
  version: 'v2',
  date: new Date().toISOString(),
  comport,
  master: {
    boardsI: 1,
    boardsW: watts,
    wattPerGHs: 0.1,
    upTime: 600,
    intervals: {
      int_3600: { chipSpeed: 100, bySol: hashrate, byPool: hashrate },
      int_30: { bySol: hashrate },
    },
  },
  slots: { int_0: { temperature: temp, errorRate: 0, chips: 10 } },
  pool: {
    diff: 1,
    userName: 'u',
    host: 'h',
    port: 1,
    intervals: { int_0: { sharesRejected: 0, sharesAccepted: 5, sharesSent: 5 } },
  },
  fans: { int_0: { rpm: [1000] } },
});

const stateWith = (stats, boards) => ({
  miner: {
    received: true,
    loading: false,
    error: null,
    data: {
      Miner: {
        online: { error: null, result: { online: { status: true } } },
        stats: { error: null, result: { stats } },
      },
    },
  },
  ...(boards
    ? { minerBoards: { received: true, data: { result: { boards }, error: null } } }
    : {}),
});

const entry = (id, kind, status, since = null) => ({ id, uuid: id, kind, status, since });

const FILES = () => [
  statFile('internal-1', '/dev/ttyS1', 1000, 100, 60),
  statFile('usb-1', '/dev/ttyACM0', 500, 50, 40),
];

describe('minerSelector — board list join', () => {
  it('labels every board with its kind from the board list', () => {
    const { data } = minerSelector(
      stateWith(FILES(), [entry('internal-1', 'internal', 'active'), entry('usb-1', 'usb', 'active')])
    );
    expect(data.stats.boards.map((b) => [b.uuid, b.kind, b.disconnected])).toEqual([
      ['internal-1', 'internal', false],
      ['usb-1', 'usb', false],
    ]);
    expect(data.stats.totalBoards).toBe(2);
    expect(data.stats.activeBoards).toBe(2);
    expect(data.stats.minerPower).toBe(150);
  });

  it('keeps a disconnected board out of power, averages and the board count', () => {
    const since = '2026-10-19T10:00:00.000Z';
    const { data } = minerSelector(
      stateWith(FILES(), [
        entry('internal-1', 'internal', 'active'),
        entry('usb-1', 'usb', 'disconnected', since),
      ])
    );
    const { stats } = data;
    // Still listed, tagged, with when it went away...
    const usb = stats.boards.find((b) => b.uuid === 'usb-1');
    expect(usb.disconnected).toBe(true);
    expect(usb.status).toBe(false);
    expect(usb.disconnectedSince).toBe(since);
    // ...but not counted. Its stat file is fresh here, so without the join it would be.
    expect(stats.minerPower).toBe(100);
    expect(stats.avgBoardTemp).toBe(60);
    // An idle board used to enter the mean as a zero: 1000 rpm and 0 gave 500.
    expect(stats.avgFanSpeed).toBe(1000);
    expect(stats.avgVoltage).toBe(1);
    expect(stats.totalBoards).toBe(1);
    expect(stats.activeBoards).toBe(1);
    expect(stats.boards).toHaveLength(2);
  });

  it('the same stat files without the join count the unplugged board (the bug)', () => {
    const { data } = minerSelector(stateWith(FILES()));
    expect(data.stats.minerPower).toBe(150);
  });

  it('every board disconnected: the miner reads as inactive', () => {
    const { data } = minerSelector(
      stateWith(FILES(), [
        entry('internal-1', 'internal', 'disconnected'),
        entry('usb-1', 'usb', 'disconnected'),
      ])
    );
    expect(data.stats.minerUptime).toBe('Inactive');
    expect(data.stats.minerPower).toBe(0);
    expect(data.stats.totalBoards).toBe(0);
  });

  it('falls back to the comport for the kind when the board list has no entry yet', () => {
    const { data } = minerSelector(stateWith(FILES()));
    expect(data.stats.boards.map((b) => b.kind)).toEqual(['internal', 'usb']);
  });

  it('an Apollo III board has no comport and takes its kind from the list', () => {
    const file = statFile('3', undefined, 1000, 100, 60);
    const { data } = minerSelector(stateWith([file], [entry('3', 'internal', 'active')]));
    expect(data.stats.boards[0].kind).toBe('internal');
  });
});
