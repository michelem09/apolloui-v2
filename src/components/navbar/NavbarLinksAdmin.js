// Chakra Imports
import {
  Flex,
  Icon,
  Text,
  useColorModeValue,
  Center,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  MenuGroup,
  MenuDivider,
  Spinner,
  Box,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react';
import { useIntl } from 'react-intl';
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';

import { SidebarResponsive } from '../sidebar/Sidebar';
import FixedPlugin from '../fixedPlugin/FixedPlugin';
import { MinerIcon } from '../UI/Icons/MinerIcon';
import { NodeIcon } from '../UI/Icons/NodeIcon';
import { MinerTempIcon } from '../UI/Icons/MinerTemp';
import { PowerOffIcon } from '../UI/Icons/PowerOffIcon';
import { StopIcon } from '../UI/Icons/StopIcon';
import { RestartIcon } from '../UI/Icons/RestartIcon';
import { SignOutIcon } from '../UI/Icons/SignOutIcon';
import { CheckIcon } from '@chakra-ui/icons';
import { WarningIcon } from '../UI/Icons/WarningIcon';
import { StartIcon } from '../UI/Icons/StartIcon';
import { GrUserWorker } from 'react-icons/gr';
import { GoVersions } from 'react-icons/go';
import { TbAlertHexagonFilled } from 'react-icons/tb';
import Link from 'next/link';
import { PowerIcon } from '../UI/Icons/PowerIcon';
import NavbarLogsModal from './NavbarLogsModal';
import SystemActionModal from './SystemActionModal';
import {
  getVersionFromPackageJson,
  capitalizeFirstLetter,
  formatTemperature,
} from '../../lib/utils';
import { useQuery } from '@apollo/client';
import { MCU_VERSION_QUERY } from '../../graphql/mcu';
import { versionGt } from '../../lib/semver';

// How often to ask the device whether a newer release exists.
//
// It used to be asked once, at mount, and never again — so a device left on a
// page never learned that a release had appeared, and the only way to see the
// badge was to reload. `refetch` existed but ran when the version modal was
// OPENED, which requires the badge that was never going to show.
//
// The backend caches the channel lookup for five minutes, so polling faster than
// that only re-reads a cached value; matching it keeps discovery under ten
// minutes without adding a single extra request to the update server.
const VERSION_POLL_MS = 5 * 60 * 1000;
import NavbarUpdateModal from './NavbarUpdateModal';
import NavbarFormatProgress from './NavbarFormatProgress';
import useNodeStorage from '../../hooks/useNodeStorage';
import { useSelector, shallowEqual } from 'react-redux';
import { useWsConnectionStatus } from '../../lib/useWsConnectionStatus';
import { soloSelector } from '../../redux/reselect/solo';
import { servicesSelector } from '../../redux/reselect/services';
import moment from '../../lib/moment';
import UsbMinersIndicator from './UsbMinersIndicator';
import { useDeviceConfig } from '../../contexts/DeviceConfigContext';

export default function HeaderLinks({
  secondary,
  routes,
  minerStats,
  minerOnline,
  soloOnline,
  settings,
  nodeOnline,
  error,
  loading,
  handleSystemAction,
}) {
  const { isSoloNode, hasMiner, canStartMiner, startBlockedReason } = useDeviceConfig();
  // Chakra Color Mode
  const navbarIcon = useColorModeValue('gray.600', 'white');
  let menuBg = useColorModeValue('white', 'navy.800');
  const badgeColor = useColorModeValue('gray.700', 'white');
  const badgeBg = useColorModeValue('secondaryGray.300', 'navy.900');
  const badgeBox = useColorModeValue('white', 'navy.800');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)'
  );

  // Without somewhere to put a blockchain the node cannot start, so the controls
  // that would try are turned off rather than left to fail.
  const intl = useIntl();
  const startBlockedLabel = intl.formatMessage({
    id: startBlockedReason === 'stuck' ? 'navbar.usb_miners.none_responding' : 'navbar.usb_miners.none_to_start',
  });
  const { unavailable: noNodeStorage, state: nodeStorageState } =
    useNodeStorage();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isLogsModalOpen,
    onOpen: onLogsModalOpen,
    onClose: onLogsModalClose,
  } = useDisclosure();
  const {
    isOpen: isSystemActionModalOpen,
    onOpen: onSystemActionModalOpen,
    onClose: onSystemActionModalClose,
  } = useDisclosure();
  const [systemActionType, setSystemActionType] = useState(null);

  const handleSignout = async () => {
    await signOut({ redirect: false });
    localStorage.removeItem('token');
  };

  // Handle app update
  //
  // Both sides come from the device, and both mean what they say: `installed` is
  // read from the release the updater actually installed, `available` from the
  // signed channel it would install from. Comparing the bundled package.json
  // against a version fetched from a completely different source could never
  // converge — it announced updates that did not exist and hid ones that did.
  const bundledVersion = getVersionFromPackageJson();
  const {
    data: dataVersion,
    refetch: refetchVersion,
    startPolling: startPollingVersion,
  } = useQuery(MCU_VERSION_QUERY, {
    pollInterval: VERSION_POLL_MS,
    // cache-and-network, not the default cache-first: serve the cached value at
    // once, but hit the network on every read anyway. The navbar unmounts during
    // an update (the offline screen replaces the whole layout) and remounts
    // fresh, and cache-first would then show the pre-update `available` from
    // cache and wait a full poll interval for a live read. This makes the badge
    // right in one round-trip instead. The only staleness left is the backend's
    // own 5-minute cache on the channel lookup.
    fetchPolicy: 'cache-and-network',
  });

  // A belt for the case the main path does not cover.
  //
  // The main path is the remount: an update takes apollo-api down, the offline
  // screen replaces the layout, this navbar unmounts, and when it comes back it
  // mounts fresh with the poll already re-armed — so nothing here is needed for
  // it, and an earlier version of this comment wrongly credited this effect with
  // the recovery. What this covers is the OTHER case: a brief blip where the WS
  // reconnects without ever going fully offline, so the layout never swaps and
  // this component is never remounted. Apollo can leave a pollInterval stopped
  // after a network error, so re-arm and read once when the socket returns.
  const wsStatus = useWsConnectionStatus();
  useEffect(() => {
    if (wsStatus !== 'online') return;
    startPollingVersion(VERSION_POLL_MS);
    refetchVersion().catch(() => {});
  }, [wsStatus, startPollingVersion, refetchVersion]);

  // Clear the badge as soon as an update finishes, instead of leaving it to the
  // next poll: for up to VERSION_POLL_MS it would otherwise keep offering the
  // version the device had just installed.
  const updateOutcome = useSelector((state) => state.update.outcome);
  useEffect(() => {
    if (updateOutcome) refetchVersion();
  }, [updateOutcome, refetchVersion]);

  const {
    installed,
    available,
    result: legacyRemoteVersion,
  } = dataVersion?.Mcu?.version || {};

  const localVersion = installed || bundledVersion;
  // Null when the channel is unreachable: show no update rather than one we
  // cannot name. Falls back to the old field while a device still runs a
  // backend that does not report the new ones.
  const remoteVersion =
    available ?? (installed ? null : legacyRemoteVersion) ?? localVersion;

  // Semver ordering, the same the updater gates on. A plain !== treated ANY
  // difference as an available update, including a channel serving something
  // older — an Update button that failed every press, and a badge that never
  // cleared, because the updater refuses to move to an older or equal version.
  const updateAvailable = versionGt(remoteVersion, localVersion);

  // "We could not ask" is not "you are up to date". The schema reports installed
  // and available separately for exactly this reason, and collapsing a null
  // available onto the local version threw the distinction away — a device with
  // no route to the channel was told affirmatively that it was current, on a
  // release the updater would happily have installed.
  const channelUnreachable = Boolean(installed) && available == null;

  const onOpenModalVersion = async () => {
    await refetchVersion();
    onOpen();
  };

  const handleOpenSystemActionModal = (type) => {
    setSystemActionType(type);
    onSystemActionModalOpen();
  };

  const handleSystemActionConfirm = () => {
    if (systemActionType === 'reboot') {
      handleSystemAction('rebootMcu');
    } else if (systemActionType === 'shutdown') {
      handleSystemAction('shutdownMcu');
    }
  };

  // Solo data for pool connection status
  const {
    loading: loadingSolo,
    data: soloData,
    error: errorSolo,
  } = useSelector(soloSelector, shallowEqual);

  // Extract ckpool disconnected status from solo service
  const { pool: poolData } = soloData || {};
  // Never having heard from ckpool is not the same as having heard from it too
  // long ago. On a pool that has just been started there is no `lastupdate`
  // yet — it appears when ckpool first writes its status file — and treating
  // that absence as "disconnected" put a warning badge in the navbar on a pool
  // that was coming up perfectly well, for as long as it took to write.
  const ckPoolSilent = !poolData?.lastupdate;
  const ckPoolDisconnected =
    !ckPoolSilent &&
    moment().diff(moment.unix(poolData.lastupdate), 'seconds') > 90;

  // Silence is only patience for so long. A pool that has been online for a
  // minute without ever writing its status file is not still coming up — the
  // writer is gone, or logs/pool/ is unreadable — and that has to read as a
  // fault again, not as a spinner that never ends.
  const [ckPoolSilentTooLong, setCkPoolSilentTooLong] = useState(false);
  useEffect(() => {
    if (!(soloOnline === 'online' && ckPoolSilent)) {
      setCkPoolSilentTooLong(false);
      return undefined;
    }
    const timer = setTimeout(() => setCkPoolSilentTooLong(true), 60000);
    return () => clearTimeout(timer);
  }, [soloOnline, ckPoolSilent]);

  const ckPoolComingUp = soloOnline === 'online' && ckPoolSilent && !ckPoolSilentTooLong;

  // Parse stats
  const { globalHashrate, avgBoardTemp } = minerStats || {};

  const { nodeEnableSoloMining, temperatureUnit } = settings || {};

  // Whether the service statuses failed to arrive at all. `servicesSelector`
  // nulls its data on error, so without this an error and a first load look
  // identical from here — and "absent means pending" would leave all three
  // badges spinning for ever over a failure nothing else in the navbar reports.
  const { error: servicesError } = useSelector(servicesSelector, shallowEqual);
  const servicesFailed = !!servicesError?.length;

  // Not having heard yet is not an error.
  //
  // Service statuses arrive on their own WebSocket topic; miner and node stats
  // arrive on theirs, every 5 and 8 seconds. So the numbers are routinely on
  // screen before the first services push lands — and until it did, these
  // badges read "Error" in orange next to live data. An absent status is a
  // question, not an answer: it shows as pending until the device says
  // otherwise. A status of 'unknown' is different — that is the backend
  // asserting it could not tell — and keeps its warning.
  const nodeStatusLabel = nodeOnline
    ? capitalizeFirstLetter(nodeOnline)
    : servicesFailed
    ? 'Error'
    : 'Pending';

  const minerStatusLabel = minerOnline
    ? error.length
      ? 'Error'
      : capitalizeFirstLetter(minerOnline)
    : servicesFailed
    ? 'Error'
    : 'Pending';

  return (
    <Flex
      w={{ sm: '100%', md: 'auto' }}
      alignItems="center"
      justify={'end'}
      flexDirection="row"
      bg={menuBg}
      flexWrap={secondary ? { base: 'wrap', md: 'nowrap' } : 'unset'}
      p="10px"
      px="14px"
      borderRadius="30px"
      boxShadow={shadow}
      mt={{ base: 4, md: 0 }}
    >
      <NavbarUpdateModal
        isOpen={isOpen}
        onClose={onClose}
        localVersion={localVersion}
        remoteVersion={remoteVersion}
        updateAvailable={updateAvailable}
        channelUnreachable={channelUnreachable}
      />

      <NavbarLogsModal isOpen={isLogsModalOpen} onClose={onLogsModalClose} />

      <SystemActionModal
        isOpen={isSystemActionModalOpen}
        onClose={onSystemActionModalClose}
        actionType={systemActionType}
        onConfirm={handleSystemActionConfirm}
      />

      <Center>
        {/* NODE */}
        {/* The badge alone says something is wrong without saying what: on a
            device with no drive it is the only thing on screen, and "warning"
            is not an instruction. */}
        <Tooltip
          isDisabled={!noNodeStorage}
          label={
            noNodeStorage
              ? intl.formatMessage({ id: `node.storage.${nodeStorageState}` })
              : ''
          }
          placement="bottom"
          hasArrow
          maxW="320px"
        >
          <Flex
            bg={badgeBg}
            display={secondary ? 'flex' : 'none'}
            borderRadius="30px"
            ms="auto"
            p="6px"
            align="center"
            // Tighter on a phone, where node, solo, miner and USB badges share 390 px.
            me={{ base: '4px', md: '8px' }}
            px={{ base: '6px', md: '10px' }}
          >
            <Flex
              align="center"
              justify="center"
              bg={badgeBox}
              h="29px"
              w="29px"
              borderRadius="30px"
              me="7px"
            >
              <Link href="/node">
                <Icon w="18px" h="18px" color={navbarIcon} as={NodeIcon} />
              </Link>
            </Flex>
            <Flex
              align="center"
              justify="center"
              bg={
                nodeStatusLabel === 'Online'
                  ? 'green.500'
                  : nodeStatusLabel === 'Offline'
                  ? 'gray.400'
                  : nodeStatusLabel === 'Error'
                  ? 'orange.500'
                  : nodeStatusLabel === 'Pending'
                  ? 'gray.300'
                  : null
              }
              h="20px"
              w="20px"
              borderRadius="30px"
            >
              <Icon
                w="12px"
                h="12px"
                color={badgeBox}
                as={
                  nodeStatusLabel === 'Online'
                    ? CheckIcon
                    : nodeStatusLabel === 'Offline'
                    ? PowerIcon
                    : nodeStatusLabel === 'Error'
                    ? WarningIcon
                    : nodeStatusLabel === 'Pending'
                    ? Spinner
                    : null
                }
              />
            </Flex>
          </Flex>
        </Tooltip>

        {/* SOLO MINING */}
        {(isSoloNode || nodeEnableSoloMining) && (
          <Flex
            bg={badgeBg}
            display={secondary ? 'flex' : 'none'}
            borderRadius="30px"
            ms="auto"
            p="6px"
            align="center"
            // Tighter on a phone, where node, solo, miner and USB badges share 390 px.
            me={{ base: '4px', md: '8px' }}
            px={{ base: '6px', md: '10px' }}
          >
            <Flex
              align="center"
              justify="center"
              bg={badgeBox}
              h="29px"
              w="29px"
              borderRadius="30px"
              me="7px"
            >
              <Link href="/solo-mining">
                <Icon
                  mt="8px"
                  w="18px"
                  h="18px"
                  color={navbarIcon}
                  as={GrUserWorker}
                />
              </Link>
            </Flex>
            <Flex
              align="center"
              justify="center"
              bg={
                soloOnline === 'online' && !ckPoolDisconnected && !ckPoolSilent
                  ? 'green.500'
                  : soloOnline === 'offline'
                  ? 'gray.400'
                  : (!soloOnline && !servicesFailed) ||
                    soloOnline === 'pending' ||
                    ckPoolComingUp
                  ? 'gray.300'
                  : 'orange.500'
              }
              h="20px"
              w="20px"
              borderRadius="30px"
            >
              <Icon
                w="12px"
                h="12px"
                color={badgeBox}
                as={
                  soloOnline === 'online' && !ckPoolDisconnected && !ckPoolSilent
                    ? CheckIcon
                    : soloOnline === 'offline'
                    ? PowerIcon
                    : (!soloOnline && !servicesFailed) ||
                      soloOnline === 'pending' ||
                      ckPoolComingUp
                    ? Spinner
                    : WarningIcon
                }
              />
            </Flex>
          </Flex>
        )}

        {/* HASHRATE */}
        {!loading && hasMiner && (
          <Flex
            bg={badgeBg}
            display={secondary ? 'flex' : 'none'}
            borderRadius="30px"
            ms="auto"
            p="6px"
            align="center"
            // Tighter on a phone, where node, solo, miner and USB badges share 390 px.
            me={{ base: '4px', md: '8px' }}
            px={{ base: '6px', md: '10px' }}
          >
            <Flex
              align="center"
              justify="center"
              bg={badgeBox}
              h="29px"
              w="29px"
              borderRadius="30px"
              me="7px"
            >
              <Link href="/miner">
                <MinerIcon w="18px" h="18px" color={navbarIcon} />
              </Link>
            </Flex>
            {!!globalHashrate?.value && minerStatusLabel === 'Online' && (
              <Text
                align={'center'}
                w="max-content"
                color={badgeColor}
                fontSize="sm"
                fontWeight="700"
                me="6px"
                minW="70px"
                display={{
                  base: (isSoloNode || nodeEnableSoloMining) ? 'none' : 'block',
                  md: 'block',
                }}
              >
                {`${globalHashrate?.value || 0} ${globalHashrate?.unit || ''}`}
              </Text>
            )}
            <Flex
              align="center"
              justify="center"
              bg={
                minerStatusLabel === 'Online'
                  ? 'green.500'
                  : minerStatusLabel === 'Offline'
                  ? 'gray.400'
                  : minerStatusLabel === 'Error'
                  ? 'orange.500'
                  : minerStatusLabel === 'Pending'
                  ? 'gray.300'
                  : null
              }
              h="20px"
              w="20px"
              borderRadius="30px"
            >
              <Icon
                w="12px"
                h="12px"
                color={badgeBox}
                as={
                  minerStatusLabel === 'Online'
                    ? CheckIcon
                    : minerStatusLabel === 'Offline'
                    ? PowerIcon
                    : minerStatusLabel === 'Error'
                    ? WarningIcon
                    : minerStatusLabel === 'Pending'
                    ? Spinner
                    : null
                }
              />
            </Flex>
          </Flex>
        )}

        {/* TEMPERATURE */}
        {!loading && hasMiner && (
          <Flex
            bg={badgeBg}
            display={secondary ? { base: 'none', md: 'flex' } : 'none'}
            borderRadius="30px"
            ms="auto"
            p="6px"
            align="center"
            me="6px"
          >
            <Flex
              align="center"
              justify="center"
              bg={badgeBox}
              h="29px"
              w="29px"
              borderRadius="30px"
              me="7px"
            >
              <MinerTempIcon w="18px" h="18px" color={navbarIcon} />
            </Flex>
            <Text
              w="max-content"
              color={badgeColor}
              fontSize="sm"
              fontWeight="700"
              me="6px"
            >
              {minerStatusLabel === 'Online' && avgBoardTemp > 0
                ? `${formatTemperature(avgBoardTemp, temperatureUnit)}`
                : '-'}
            </Text>
          </Flex>
        )}

        <UsbMinersIndicator secondary={secondary} />

        <Flex p="0px" mx="4px" display={{ base: 'none', md: 'block' }}>
          <FixedPlugin type="small" />
        </Flex>

        <Box display={{ base: 'none', md: 'block' }}>
          <SidebarResponsive routes={routes} />
        </Box>

        <NavbarFormatProgress />

        <Flex p="0px" mx="4px" justify="flex-end">
          <Menu isLazy>
            <MenuButton
              as={IconButton}
              aria-label="Options"
              icon={
                <PowerOffIcon
                  className={
                    updateAvailable &&
                    'animate__animated animate__tada animate__infinite'
                  }
                />
              }
              bg={updateAvailable && 'orange.500'}
            />
            <MenuList>
              {hasMiner && (
                <>
                  <MenuGroup title="Miner">
                    {/* Box child, not shouldWrapChildren: its inline span shrank the row */}
                    <Tooltip
                      label={startBlockedLabel}
                      isDisabled={canStartMiner}
                      hasArrow
                    >
                      <Box w="100%">
                        <MenuItem
                          icon={<StartIcon />}
                          isDisabled={
                            !canStartMiner ||
                            minerOnline === 'online' ||
                            minerOnline === 'pending'
                          }
                          onClick={() => handleSystemAction('startMiner')}
                        >
                          Start
                        </MenuItem>
                      </Box>
                    </Tooltip>
                    <MenuItem
                      icon={<StopIcon />}
                      isDisabled={minerOnline === 'offline'}
                      onClick={() => handleSystemAction('stopMiner')}
                    >
                      Stop
                    </MenuItem>
                    {/* Box child, not shouldWrapChildren: its inline span shrank the row */}
                    <Tooltip
                      label={startBlockedLabel}
                      isDisabled={canStartMiner}
                      hasArrow
                    >
                      <Box w="100%">
                        <MenuItem
                          icon={<RestartIcon />}
                          isDisabled={
                            !canStartMiner ||
                            minerOnline === 'offline' ||
                            minerOnline === 'pending'
                          }
                          onClick={() => handleSystemAction('restartMiner')}
                        >
                          Restart
                        </MenuItem>
                      </Box>
                    </Tooltip>
                  </MenuGroup>
                  <MenuDivider />
                </>
              )}
              <MenuGroup title="Node">
                <MenuItem
                  icon={<StartIcon />}
                  isDisabled={
                    noNodeStorage || nodeOnline === 'online' || nodeOnline === 'pending'
                  }
                  onClick={() => handleSystemAction('startNode')}
                >
                  Start
                </MenuItem>
                {/* Stopping is never gated on storage — the case where the
                    drive went away with bitcoind still running is exactly when
                    it must be stoppable, before the blockchain it is still
                    writing lands on the SD card. Start is; nothing can start
                    without somewhere to run. */}
                <MenuItem
                  icon={<StopIcon />}
                  isDisabled={nodeOnline === 'offline'}
                  onClick={() => handleSystemAction('stopNode')}
                >
                  Stop
                </MenuItem>
              </MenuGroup>
              <MenuDivider />
              <MenuGroup title="Solo Server">
                <MenuItem
                  icon={<StartIcon />}
                  isDisabled={
                    noNodeStorage ||
                    soloOnline === 'online' ||
                    soloOnline === 'pending'
                  }
                  onClick={() => handleSystemAction('startSolo')}
                >
                  Start
                </MenuItem>
                <MenuItem
                  icon={<StopIcon />}
                  isDisabled={soloOnline === 'offline'}
                  onClick={() => handleSystemAction('stopSolo')}
                >
                  Stop
                </MenuItem>
                <MenuItem
                  icon={<RestartIcon />}
                  isDisabled={
                    noNodeStorage ||
                    soloOnline === 'offline' ||
                    soloOnline === 'pending'
                  }
                  onClick={() => handleSystemAction('restartSolo')}
                >
                  Restart
                </MenuItem>
              </MenuGroup>
              <MenuDivider />
              <MenuGroup title="System">
                <MenuItem
                  icon={<RestartIcon />}
                  onClick={() => handleOpenSystemActionModal('reboot')}
                >
                  Reboot
                </MenuItem>
                <MenuItem
                  icon={<PowerOffIcon />}
                  onClick={() => handleOpenSystemActionModal('shutdown')}
                >
                  Shutdown
                </MenuItem>
                <MenuItem icon={<SignOutIcon />} onClick={handleSignout}>
                  Signout
                </MenuItem>
              </MenuGroup>
              <MenuDivider />
              <MenuGroup title="Version">
                <MenuItem
                  icon={
                    updateAvailable ? (
                      <TbAlertHexagonFilled color="red" />
                    ) : (
                      <GoVersions />
                    )
                  }
                  onClick={() => onOpenModalVersion()}
                >
                  v{localVersion}
                </MenuItem>
              </MenuGroup>
            </MenuList>
          </Menu>
        </Flex>
      </Center>
    </Flex>
  );
}

HeaderLinks.propTypes = {
  variant: PropTypes.string,
  fixed: PropTypes.bool,
  secondary: PropTypes.bool,
  onOpen: PropTypes.func,
};
