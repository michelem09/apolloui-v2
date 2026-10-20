// What the topbar indicator needs from the board list.

export const usbBoardsOf = (boards) => (boards || []).filter((b) => b.kind === 'usb');

// What the indicator shows when boards are in different states: the worst wins,
// stuck (red) > disconnected (orange) > booting (spinner) > normal.
export const usbIndicatorState = (usb) => {
  const has = (status) => (usb || []).some((b) => b.status === status);
  if (has('stuck')) return 'stuck';
  if (has('disconnected')) return 'disconnected';
  if (has('booting')) return 'booting';
  return 'normal';
};

// USB boards that were active in `prev` and are disconnected in `next`: the unplug
// itself, as opposed to a board that is merely still listed as disconnected. With
// no `prev` there is nothing to compare, and a page opened while a board is
// already unplugged must not announce it as news.
export const newlyDisconnected = (prev, next) => {
  if (!prev) return [];
  const before = new Map(usbBoardsOf(prev).map((b) => [b.id, b.status]));
  return usbBoardsOf(next).filter(
    (b) => b.status === 'disconnected' && before.get(b.id) === 'active'
  );
};

// How long a disconnected board stays listed, as the backend scheduled it.
export const DEFAULT_EXPIRY_MINUTES = 15;
export const expiryMinutes = (board) => {
  const since = Date.parse(board?.since);
  const expires = Date.parse(board?.expiresAt);
  if (!Number.isFinite(since) || !Number.isFinite(expires) || expires <= since) {
    return DEFAULT_EXPIRY_MINUTES;
  }
  return Math.round((expires - since) / 60000);
};

// USB boards that were booting in `prev` and are stuck in `next`. Same rule as the
// unplug: nothing to compare on the first payload, so a page opened while a board
// is already stuck does not announce it as news.
export const newlyStuck = (prev, next) => {
  if (!prev) return [];
  const before = new Map(usbBoardsOf(prev).map((b) => [b.id, b.status]));
  return usbBoardsOf(next).filter((b) => b.status === 'stuck' && before.get(b.id) === 'booting');
};
