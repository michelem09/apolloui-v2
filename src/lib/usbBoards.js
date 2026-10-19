// What the topbar indicator needs from the board list.

export const usbBoardsOf = (boards) => (boards || []).filter((b) => b.kind === 'usb');

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
