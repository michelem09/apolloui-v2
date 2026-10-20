import { createSelector } from 'reselect';
import { loadingUntilAnswered } from '../utils/answered';
import _ from 'lodash';
import { initialState } from '../../graphql/miner';
import { displayHashrate, convertHashrateStringToValue, boardKindOf } from '../../lib/utils';
import moment from '../../lib/moment';

const minerDataSelector = (state) => state.miner.data;
const minerErrorSelector = (state) => state.miner.error;
const minerLoadingSelector = (state) => loadingUntilAnswered(state.miner);
const minerLastShareSelector = (state) => state.miner.lastShare;
// The board list is optional here (a store without that slice still works): a
// board with no entry in it is simply taken to be connected.
const boardListSelector = (state) => state.minerBoards?.data?.result?.boards;

const NO_BOARDS = [];
const BOOT_STATES = ['booting', 'stuck'];

// Placeholder row for a registry board that has no stat file yet. Numbers are
// zero, text is empty; `status: false` keeps it out of every sum and average.
const bootStub = (entry) => ({
  uuid: entry.id,
  date: null,
  status: false,
  comport: entry.port || null,
  kind: 'usb',
  disconnected: false,
  disconnectedSince: null,
  bootState: entry.status,
  // The API decides what `since` means: IAP start while booting, the instant it
  // became stuck once stuck. Shown as is, never recomputed here.
  bootSince: entry.since,
  poolStatus: false,
  poolUsername: null,
  poolHost: null,
  poolPort: null,
  poolHashrateInGh: 0,
  avgPoolHashrateInGh: 0,
  upTime: 0,
  version: null,
  lastShareTimeX: 0,
  lastShareTime: null,
  wattPerGHs: 0,
  wattTotal: 0,
  hashrateInGh: 0,
  avgHashrateInGh: 0,
  efficiency: 0,
  fanSpeed: 0,
  temperature: 0,
  errorRate: 0,
  chipSpeed: 0,
  chips: 0,
  sharesAccepted: 0,
  sharesRejected: 0,
  sharesSent: 0,
  diff: 0,
  voltage: 0,
});

export const minerSelector = createSelector(
  minerDataSelector,
  minerErrorSelector,
  minerLoadingSelector,
  minerLastShareSelector,
  boardListSelector,
  (minerData, minerError, minerLoading, lastShareMap, boardList = NO_BOARDS) => {
    // Stat file id === board id (MinerStats.uuid === MinerBoard.id). A board the
    // backend reports as disconnected has a stat file that is stale but still
    // there: it is listed, tagged, and kept out of every total below.
    const boardById = new Map(boardList.map((entry) => [entry.id, entry]));

    const {
      Miner: {
        online: { error: errorOnline, result = {} },
        stats: { error: errorStats, result: resultStats },
      },
    } = minerData ?? initialState;

    const minerStats = resultStats?.stats ?? [];

    let minerOnline = false;
    if (result?.online && result?.online?.status)
      minerOnline = result.online.status;

    const errors = [...[minerError, errorOnline, errorStats].filter(Boolean)];

    let stats;

    if (minerStats) {
      const maxStatusInterval =
        process.env.NEXT_PUBLIC_ENV === 'development' ? 10 : 1;

      const boards = minerStats.map((board) => {
        const {
          uuid,
          date,
          version,
          comport,
          master: {
            boardsI: voltage,
            boardsW: wattTotal,
            wattPerGHs,
            upTime,
            intervals: {
              int_3600: {
                chipSpeed,
                bySol: avgHashrateInGh,
                byPool: avgPoolHashrateInGh,
              },
              int_30: { bySol: hashrateInGh },
            },
          },
          slots: {
            int_0: {
              temperature,
              errorRate,
              chips,
            },
          },
          pool: {
            diff,
            userName: poolUsername,
            host: poolHost,
            port: poolPort,
            intervals: {
              int_0: { sharesRejected, sharesAccepted, sharesSent },
            },
          },
          fans: {
            int_0: { rpm: fanRpm },
          },
        } = board;

        // Board liveness = stat-file freshness (a board is alive if its stat file
        // is being updated, regardless of whether the pool is accepting shares).
        const shareTime = moment(date);
        const ageMinutes = moment.duration(moment().diff(shareTime)).asMinutes();
        const registered = boardById.get(uuid);
        const disconnected = registered?.status === 'disconnected';
        // Booting (bootloader, the miner restarts by itself when the board is
        // ready) and stuck: attached, listed, tagged, and out of every total like
        // a disconnected one. Its stat file is the one from before the reset.
        const bootState = BOOT_STATES.includes(registered?.status) ? registered.status : null;
        const status = ageMinutes <= maxStatusInterval && !disconnected && !bootState;
        const poolStatus = status;
        // "Last share" is the real thing: the moment this board's cumulative share
        // count last moved, tracked in the miner slice. Falls back to the stat-file
        // time until the first change is observed (e.g. right after a reload).
        const lastShareAt = lastShareMap?.[board.uuid]?.at;
        const lastsharetime = lastShareAt ? moment(lastShareAt) : shareTime;

        const poolHashrateInGh = avgPoolHashrateInGh;

        return {
          uuid,
          date,
          status,
          comport,
          kind: boardKindOf({ kind: registered?.kind, comport }),
          disconnected,
          disconnectedSince: disconnected ? registered.since : null,
          bootState,
          bootSince: bootState ? registered.since : null,
          poolStatus,
          poolUsername,
          poolHost,
          poolPort,
          poolHashrateInGh,
          avgPoolHashrateInGh,
          upTime,
          version,
          lastShareTimeX: parseInt(lastsharetime.format('X')),
          lastShareTime: lastsharetime.fromNow(),
          wattPerGHs,
          wattTotal,
          hashrateInGh,
          avgHashrateInGh,
          efficiency: avgHashrateInGh
            ? (wattTotal / avgHashrateInGh) * 1000
            : 0,
          fanSpeed: _.mean(fanRpm),
          temperature,
          errorRate,
          chipSpeed,
          chips,
          sharesAccepted,
          sharesRejected,
          sharesSent,
          diff,
          voltage,
        };
      });








      // A board seen only in its bootloader has no stat file at all: still listed,
      // so the page does not look as if nothing had been plugged in.
      const withStat = new Set(minerStats.map((s) => s.uuid));
      for (const entry of boardList) {
        if (entry.kind !== 'usb' || !BOOT_STATES.includes(entry.status) || withStat.has(entry.id)) continue;
        boards.push(bootStub(entry));
      }

      const maxBoardDate = _.maxBy(boards, 'date');

      const maxBoardByShareTime = _.maxBy(boards, 'lastShareTimeX');
      const maxLastShareTime = maxBoardByShareTime?.lastShareTimeX || null;
      const lastShareTime = maxLastShareTime
        ? moment(maxLastShareTime, 'X').fromNow()
        : null;

      let minerUptime = moment().to(
        moment().subtract(
          _.chain(boards)
            .filter((hb) => {
              return hb.status;
            })
            .meanBy((hb) => {
              return hb.upTime;
            })
            .value(),
          'seconds'
        ),
        true
      );

      if (_.every(boards, ['status', false])) minerUptime = 'Inactive';

      // Disconnected boards are listed but are not part of the miner any more.
      const connectedBoards = _.reject(boards, 'disconnected');

      const globalHashrate = displayHashrate(
        _.sumBy(boards, (hb) => {
          if (hb.status) return hb.hashrateInGh;
          return null;
        }),
        'GH/s',
        false,
        2,
        true
      );

      const globalAvgHashrateInGh = _.sumBy(boards, (hb) => {
        if (hb.status) return hb.avgHashrateInGh;
        return null;
      });

      const globalAvgHashrate = displayHashrate(
        globalAvgHashrateInGh,
        'GH/s',
        false,
        2,
        true
      );

      const poolHashrate = displayHashrate(
        _.sumBy(boards, (hb) => {
          if (hb.status) return hb.poolHashrateInGh;
          return null;
        }),
        'GH/s',
        true,
        2
      );

      const poolHAvgashrate = displayHashrate(
        _.sumBy(boards, (hb) => {
          if (hb.status) return hb.poolHashrateInGh;
          return null;
        }),
        'GH/s',
        true,
        2
      );

      // Miner watt
      const minerPower = _.sumBy(boards, (hb) => {
        if (hb.status) return hb.wattTotal;
        return 0;
      });

      const minerPowerPerGh = _.sumBy(boards, (hb) => {
        if (hb.status) return hb.wattPerGHs;
        return 0;
      });

      // Board sum/avg
      let avgBoardEfficiency = (minerPower / globalAvgHashrateInGh) * 1000;
      // A miner that has just restarted already draws watts while its averaging
      // window is still empty, so this divides by zero for the first interval:
      // Infinity, which CountUp then renders as NaN. The per-board efficiency
      // above guards the same expression; the aggregate did not.
      if (!isFinite(avgBoardEfficiency)) avgBoardEfficiency = 0;

      // Averages are taken over the boards that are mining. Averaging all of them
      // with a zero for each idle one dragged every figure down by the boards
      // that were not there (an unplugged USB board most of all).
      const activeList = _.filter(boards, 'status');

      let avgBoardTemp = _.meanBy(activeList, (hb) => hb.temperature);

      if (isNaN(avgBoardTemp)) avgBoardTemp = 0;

      let avgBoardErrors = _.chain(boards)
        .filter((hb) => {
          return hb.status;
        })
        .meanBy((hb) => {
          return hb.errorRate;
        })
        .value();

      if (isNaN(avgBoardErrors)) avgBoardErrors = 0;

      let totalBoardRejected = _.sumBy(boards, (hb) => {
        if (hb.status && hb.sharesRejected) return hb.sharesRejected;
        return 0;
      });

      if (isNaN(totalBoardRejected)) totalBoardRejected = 0;

      let totalBoardAccepted = _.sumBy(boards, (hb) => {
        if (hb.status && hb.sharesAccepted) return hb.sharesAccepted;
        return 0;
      });

      if (isNaN(totalBoardAccepted)) totalBoardAccepted = 0;

      let avgChipSpeed = _.meanBy(activeList, (hb) => hb.chipSpeed || 0);

      if (isNaN(avgChipSpeed)) avgChipSpeed = 0;

      let avgFanSpeed = _.meanBy(activeList, (hb) => hb.fanSpeed || 0);

      if (isNaN(avgFanSpeed)) avgFanSpeed = 0;

      let avgVoltage = _.meanBy(activeList, (hb) => hb.voltage || 0);

      if (isNaN(avgVoltage)) avgVoltage = 0;

      // Pool sum/avg
      const totalSharesSent = _.sumBy(boards, (hb) => {
        if (hb.status && hb.sharesSent) return hb.sharesSent;
        return 0;
      });

      const totalSharesAccepted = _.sumBy(boards, (hb) => {
        if (hb.status && hb.sharesAccepted) return hb.sharesAccepted;
        return 0;
      });

      const totalSharesRejected = _.sumBy(boards, (hb) => {
        if (hb.status && hb.sharesRejected) return hb.sharesRejected;
        return 0;
      });

      let avgDiff = _.meanBy(activeList, (hb) => hb.diff || 0);

      if (isNaN(avgDiff)) avgDiff = 0;

      const activeBoards = _.size(_.filter(boards, { status: true }));
      // An unplugged board still counts in the denominator (Active 0/1), while staying
      // out of the numerator, the sums and the averages.
      const totalBoards = _.size(boards);
      const activePools = _.size(_.filter(boards, { poolStatus: true }));

      stats = {
        date: maxBoardDate?.date || null,
        boards,
        minerUptime,
        globalHashrate,
        globalAvgHashrate,
        minerPower,
        minerPowerPerGh,
        avgBoardEfficiency,
        avgBoardTemp,
        avgBoardErrors,
        totalBoardAccepted,
        totalBoardRejected,
        avgChipSpeed,
        avgFanSpeed,
        avgVoltage,
        lastShareTime,
        totalSharesSent,
        totalSharesAccepted,
        totalSharesRejected,
        avgDiff,
        poolHashrate,
        poolHAvgashrate,
        activeBoards,
        totalBoards,
        activePools,
        soloMining: false,
      };
    }

    const selectorResult = {
      loading: minerLoading,
      error: errors,
      data: {
        online: !errors.length && minerOnline,
        stats: !errors.length && stats,
      },
    };
    return selectorResult;
  }
);
