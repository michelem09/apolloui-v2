import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Icon,
  Spinner,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { MdOutlineUsb } from 'react-icons/md';
import { minerBoardsSelector } from '../../redux/reselect/minerBoards';
import { sendFeedback } from '../../redux/slices/feedbackSlice';
import {
  expiryMinutes,
  newlyDisconnected,
  newlyStuck,
  usbBoardsOf,
  usbIndicatorState,
} from '../../lib/usbBoards';

// A USB icon with the number of USB miners that are active. It is not there when
// no USB board is known at all. States, the worst one winning: red when a board
// does not answer (stuck in its bootloader), orange when one has been unplugged,
// a spinner while one boots, normal otherwise. The detail of every board that is
// not active is in the tooltip; toasts announce an unplug and a board turning stuck.
const UsbMinersIndicator = ({ secondary = true }) => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const { live, boards, usbActiveCount } = useSelector(minerBoardsSelector, shallowEqual);

  const badgeBg = useColorModeValue('secondaryGray.300', 'navy.900');
  const badgeBox = useColorModeValue('white', 'navy.800');
  const badgeColor = useColorModeValue('gray.700', 'white');
  const navbarIcon = useColorModeValue('gray.600', 'white');

  const usb = usbBoardsOf(boards);
  const disconnected = usb.filter((b) => b.status === 'disconnected');
  const booting = usb.filter((b) => b.status === 'booting');
  const stuck = usb.filter((b) => b.status === 'stuck');
  const state = usbIndicatorState(usb);

  // The unplug toast: compares each payload with the one before it. `previous`
  // stays null until the first list has arrived, so opening the page with a board
  // already unplugged is not announced as news.
  const previous = useRef(null);
  useEffect(() => {
    if (!live) return;
    for (const board of newlyDisconnected(previous.current, boards)) {
      dispatch(
        sendFeedback({
          type: 'warning',
          message: intl.formatMessage(
            { id: 'miner.board.unplugged_toast' },
            { minutes: expiryMinutes(board) }
          ),
        })
      );
    }
    for (const board of newlyStuck(previous.current, boards)) {
      dispatch(
        sendFeedback({
          type: 'error',
          message: intl.formatMessage(
            { id: 'miner.board.stuck_toast' },
            { board: `…${String(board.serial || board.id).slice(-6)}` }
          ),
        })
      );
    }
    previous.current = boards;
  }, [live, boards, dispatch, intl]);

  if (!live || usb.length === 0) return null;

  const warn = state === 'stuck' || state === 'disconnected';
  const alertBg = state === 'stuck' ? 'red.500' : 'orange.500';
  const time = (iso) =>
    iso
      ? intl.formatTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })
      : '';

  const label = (
    <Box>
      <Text>
        {intl.formatMessage({ id: 'navbar.usb_miners.tooltip' }, { count: usbActiveCount })}
      </Text>
      {[
        [stuck, 'stuck'],
        [disconnected, 'disconnected'],
        [booting, 'booting'],
      ].map(
        ([list, key]) =>
          list.length > 0 && (
            <Box key={key}>
              <Text fontWeight="700">
                {intl.formatMessage({ id: `navbar.usb_miners.${key}` }, { count: list.length })}
              </Text>
              {list.map((board) => (
                <Text key={board.id}>
                  {intl.formatMessage(
                    { id: `navbar.usb_miners.board_${key}` },
                    // The last digits of the serial tell two boards apart.
                    { board: `…${String(board.serial || board.id).slice(-6)}`, time: time(board.since) }
                  )}
                </Text>
              ))}
            </Box>
          )
      )}
    </Box>
  );

  return (
    <Tooltip label={label} hasArrow placement="bottom">
      <Flex
        data-testid="usb-miners-indicator"
        data-state={state}
        aria-label={intl.formatMessage({ id: 'navbar.usb_miners.label' })}
        tabIndex={0}
        bg={warn ? alertBg : badgeBg}
        display={secondary ? 'flex' : 'none'}
        borderRadius="30px"
        // Tighter on a phone: this is the fourth badge in a bar that has to fit
        // 390 px beside the node, solo and miner ones.
        p={{ base: '4px', md: '6px' }}
        align="center"
        me={{ base: '4px', md: '8px' }}
        px={{ base: '6px', md: '10px' }}
      >
        <Icon as={MdOutlineUsb} w="18px" h="18px" color={warn ? 'white' : navbarIcon} />
        {state === 'booting' && (
          <Spinner
            data-testid="usb-miners-spinner"
            size="xs"
            ms={{ base: '4px', md: '6px' }}
            color={navbarIcon}
            label={intl.formatMessage({ id: 'navbar.usb_miners.booting' }, { count: booting.length })}
          />
        )}
        <Flex
          align="center"
          justify="center"
          bg={warn ? 'whiteAlpha.300' : badgeBox}
          color={warn ? 'white' : badgeColor}
          h="20px"
          minW="20px"
          px="5px"
          ms={{ base: '4px', md: '6px' }}
          borderRadius="30px"
          fontSize="xs"
          fontWeight="700"
        >
          {usbActiveCount}
        </Flex>
      </Flex>
    </Tooltip>
  );
};

export default UsbMinersIndicator;
