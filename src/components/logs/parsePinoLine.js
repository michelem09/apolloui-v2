/**
 * The backend emits one pino JSON object per line, but the log tab shows the raw
 * journal — which also carries the units' own plain-text output and everything
 * written before the device was upgraded. So parsing is best-effort per line: a
 * line we understand is rendered structured, anything else is shown verbatim
 * rather than hidden.
 */

// journalctl -o short-iso prefixes its own timestamp/host/unit before the message.
const JOURNAL_PREFIX = /^(\S+\s+\S+\s+\S+\[\d+\]:\s*)/;

const LEVEL_ORDER = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

export const LEVEL_COLORS = {
  trace: 'gray',
  debug: 'gray',
  info: 'blue',
  warn: 'orange',
  error: 'red',
  fatal: 'red',
};

/**
 * @returns {{ parsed: boolean, level?, component?, msg?, time?, fields?, raw }}
 */
export function parsePinoLine(line) {
  const raw = line;
  if (!line || !line.includes('{')) return { parsed: false, raw };

  // Find the JSON payload, whether or not journald prefixed the line.
  const start = line.indexOf('{');
  const candidate = line.slice(start);
  const prefix = line.slice(0, start).replace(JOURNAL_PREFIX, '');

  let entry;
  try {
    entry = JSON.parse(candidate);
  } catch (e) {
    return { parsed: false, raw };
  }

  // A JSON line that isn't ours (some service logging JSON) has no level/msg.
  if (!entry || typeof entry !== 'object' || (!entry.level && !entry.msg)) {
    return { parsed: false, raw };
  }

  const { level, time, msg, component, ...fields } = entry;
  return {
    parsed: true,
    level: typeof level === 'string' ? level.toLowerCase() : 'info',
    time,
    msg: msg || '',
    component: component || null,
    // Everything else (err, ids, counters) is kept so it can be shown on demand.
    fields: Object.keys(fields).length ? fields : null,
    prefix: prefix.trim() || null,
    raw,
  };
}

export function parseLogContent(content) {
  if (!content) return [];
  return content.split('\n').filter((line) => line.trim().length).map(parsePinoLine);
}

/**
 * Levels present in this batch, ordered by severity — the filter only offers what
 * is actually there, so it never lists options that match nothing.
 */
export function availableLevels(entries) {
  const present = new Set(entries.filter((e) => e.parsed).map((e) => e.level));
  return LEVEL_ORDER.filter((level) => present.has(level));
}

export function availableComponents(entries) {
  const present = new Set(entries.filter((e) => e.parsed && e.component).map((e) => e.component));
  return Array.from(present).sort();
}

/**
 * Filtering keeps unparsed lines: they are the plain-text journal entries (unit
 * output, kernel messages), and silently dropping them would make the tab lie
 * about what the device logged.
 */
export function filterEntries(entries, { minLevel, component }) {
  const floor = minLevel ? LEVEL_ORDER.indexOf(minLevel) : -1;

  return entries.filter((entry) => {
    if (!entry.parsed) return !component && floor <= 0;
    if (component && entry.component !== component) return false;
    if (floor > 0 && LEVEL_ORDER.indexOf(entry.level) < floor) return false;
    return true;
  });
}

export { LEVEL_ORDER };
