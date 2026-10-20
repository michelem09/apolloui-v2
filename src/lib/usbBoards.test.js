import {
  newlyDisconnected,
  newlyStuck,
  usbIndicatorState,
  expiryMinutes,
  usbBoardsOf,
} from './usbBoards';

const b = (id, status, kind = 'usb') => ({ id, kind, status });

describe('newlyDisconnected', () => {
  it('reports a USB board that went active -> disconnected', () => {
    const prev = [b('a', 'active'), b('i', 'active', 'internal')];
    const next = [b('a', 'disconnected'), b('i', 'active', 'internal')];
    expect(newlyDisconnected(prev, next).map((x) => x.id)).toEqual(['a']);
  });

  it('is silent on the first payload, even if a board is already disconnected', () => {
    expect(newlyDisconnected(null, [b('a', 'disconnected')])).toEqual([]);
    expect(newlyDisconnected(undefined, [b('a', 'disconnected')])).toEqual([]);
  });

  it('does not repeat itself while the board stays disconnected', () => {
    const was = [b('a', 'disconnected')];
    expect(newlyDisconnected(was, [b('a', 'disconnected')])).toEqual([]);
  });

  it('a board that was never seen active is not an unplug', () => {
    expect(newlyDisconnected([], [b('a', 'disconnected')])).toEqual([]);
  });

  it('a board that simply expired from the list is not reported', () => {
    expect(newlyDisconnected([b('a', 'active')], [])).toEqual([]);
  });

  it('ignores an internal board', () => {
    expect(
      newlyDisconnected([b('i', 'active', 'internal')], [b('i', 'disconnected', 'internal')])
    ).toEqual([]);
  });
});

describe('expiryMinutes', () => {
  it('reads the window the backend scheduled', () => {
    expect(
      expiryMinutes({ since: '2026-10-19T10:00:00.000Z', expiresAt: '2026-10-19T10:15:00.000Z' })
    ).toBe(15);
  });
  it('falls back to 15 when the dates are missing or nonsense', () => {
    expect(expiryMinutes({})).toBe(15);
    expect(expiryMinutes({ since: 'x', expiresAt: 'y' })).toBe(15);
    expect(
      expiryMinutes({ since: '2026-10-19T10:15:00.000Z', expiresAt: '2026-10-19T10:00:00.000Z' })
    ).toBe(15);
  });
});

describe('usbBoardsOf', () => {
  it('keeps USB boards only', () => {
    expect(usbBoardsOf([b('a', 'active'), b('i', 'active', 'internal')]).map((x) => x.id)).toEqual(['a']);
    expect(usbBoardsOf(undefined)).toEqual([]);
  });
});

describe('usbIndicatorState', () => {
  const st = (...statuses) => usbIndicatorState(statuses.map((s, i) => b(`b${i}`, s)));
  it('is normal with only active boards, or none', () => {
    expect(st('active', 'active')).toBe('normal');
    expect(st()).toBe('normal');
  });
  it('booting alone is the spinner', () => {
    expect(st('active', 'booting')).toBe('booting');
  });
  it('worst wins: stuck > disconnected > booting > normal', () => {
    expect(st('booting', 'disconnected')).toBe('disconnected');
    expect(st('booting', 'stuck')).toBe('stuck');
    expect(st('disconnected', 'stuck', 'booting', 'active')).toBe('stuck');
    expect(st('disconnected', 'active')).toBe('disconnected');
  });
});

describe('newlyStuck', () => {
  it('reports booting -> stuck once', () => {
    expect(newlyStuck([b('a', 'booting')], [b('a', 'stuck')]).map((x) => x.id)).toEqual(['a']);
    expect(newlyStuck([b('a', 'stuck')], [b('a', 'stuck')])).toEqual([]);
  });
  it('is silent on the first payload', () => {
    expect(newlyStuck(null, [b('a', 'stuck')])).toEqual([]);
  });
  it('ignores internal boards and other transitions', () => {
    expect(newlyStuck([b('a', 'active')], [b('a', 'disconnected')])).toEqual([]);
    expect(newlyStuck([b('i', 'booting', 'internal')], [b('i', 'stuck', 'internal')])).toEqual([]);
  });
});
