import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Icon,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { MdOutlineUsb } from 'react-icons/md';
import { minerBoardsSelector } from '../../redux/reselect/minerBoards';
import { sendFeedback } from '../../redux/slices/feedbackSlice';
import { expiryMinutes, newlyDisconnected, usbBoardsOf } from '../../lib/usbBoards';

// A USB icon with the number of USB miners that are plugged in. It is not there
// when no USB board is known at all; it goes orange, with the detail in a tooltip,
// when one has been unplugged, and a toast announces the unplug itself.
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
    previous.current = boards;
  }, [live, boards, dispatch, intl]);

  if (!live || usb.length === 0) return null;

  const warn = disconnected.length > 0;
  const time = (iso) =>
    iso
      ? intl.formatTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })
      : '';

  const label = (
    <Box>
      <Text>
        {intl.formatMessage({ id: 'navbar.usb_miners.tooltip' }, { count: usbActiveCount })}
      </Text>
      {warn && (
        <>
          <Text fontWeight="700">
            {intl.formatMessage(
              { id: 'navbar.usb_miners.disconnected' },
              { count: disconnected.length }
            )}
          </Text>
          {disconnected.map((board) => (
            <Text key={board.id}>
              {intl.formatMessage(
                { id: 'navbar.usb_miners.board_disconnected' },
                // The last digits of the serial tell two boards apart.
                { board: `…${String(board.serial || board.id).slice(-6)}`, time: time(board.since) }
              )}
            </Text>
          ))}
        </>
      )}
    </Box>
  );

  return (
    <Tooltip label={label} hasArrow placement="bottom">
      <Flex
        data-testid="usb-miners-indicator"
        aria-label={intl.formatMessage({ id: 'navbar.usb_miners.label' })}
        tabIndex={0}
        bg={warn ? 'orange.500' : badgeBg}
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
