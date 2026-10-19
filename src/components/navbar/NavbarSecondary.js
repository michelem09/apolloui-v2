// Chakra Imports
import {
  Flex,
  Icon,
  Text,
  useColorModeValue,
  Center,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import { useIntl } from 'react-intl';
import { useDeviceConfig } from '../../contexts/DeviceConfigContext';
import { RestartIcon } from '../UI/Icons/RestartIcon';
import { StopIcon } from '../UI/Icons/StopIcon';

const NavbarSeconday = ({
  type,
  handleSystemAction,
  nodeOnline,
  minerOnline,
  soloOnline, // Add solo service status
}) => {
  const intl = useIntl();
  const { canStartMiner } = useDeviceConfig();
  const noBoard = intl.formatMessage({ id: 'navbar.usb_miners.none_to_start' });
  // Chakra Color Mode
  const navbarIcon = useColorModeValue('gray.400', 'white');
  const menuBg = useColorModeValue('white', 'navy.800');
  const badgeColor = useColorModeValue('gray.600', 'gray.300');
  const badgeBox = useColorModeValue('gray.300', 'navy.800');
  const iconColor = useColorModeValue('gray.600', 'gray.300');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)'
  );

  return (
    <Flex
      w={{ sm: '100%', md: 'auto' }}
      alignItems="center"
      flexDirection="row"
      flexWrap={'unset'}
      p="10px"
    >
      {/* Miner */}
      {type === 'miner' && (
        <Center>
          {(minerOnline === 'online' || minerOnline === 'pending') && (
            <>
              <Button
                ms="auto"
                p="6px"
                align="center"
                me="6px"
                bgColor={badgeBox}
                onClick={() => handleSystemAction('stopMiner')}
              >
                <Flex
                  align="center"
                  justify="center"
                  bg={badgeBox}
                  h="32px"
                  w="32px"
                  borderRadius="30px"
                  me="7px"
                >
                  <Icon w="18px" h="18px" color={iconColor} as={StopIcon} />
                </Flex>
                <Text
                  w="max-content"
                  color={badgeColor}
                  fontSize="sm"
                  fontWeight="600"
                  me="6px"
                >
                  Stop
                </Text>
              </Button>

              <Tooltip label={noBoard} isDisabled={canStartMiner} shouldWrapChildren hasArrow>
              <Button
                ms="auto"
                p="6px"
                align="center"
                me="6px"
                bgColor={badgeBox}
                onClick={() => handleSystemAction('restartMiner')}
                isDisabled={!canStartMiner || minerOnline === 'pending'}
              >
                <Flex
                  align="center"
                  justify="center"
                  bg={badgeBox}
                  h="32px"
                  w="32px"
                  borderRadius="30px"
                  me="7px"
                >
                  <Icon w="18px" h="18px" color={iconColor} as={RestartIcon} />
                </Flex>
                <Text
                  w="max-content"
                  color={badgeColor}
                  fontSize="sm"
                  fontWeight="600"
                  me="6px"
                >
                  Restart
                </Text>
              </Button>
              </Tooltip>
            </>
          )}

          {minerOnline === 'offline' && (
            <Tooltip label={noBoard} isDisabled={canStartMiner} shouldWrapChildren hasArrow>
            <Button
              ms="auto"
              p="6px"
              align="center"
              me="6px"
              bgColor={badgeBox}
              onClick={() => handleSystemAction('startMiner')}
              isDisabled={!canStartMiner}
            >
              <Flex
                align="center"
                justify="center"
                bg={badgeBox}
                h="32px"
                w="32px"
                borderRadius="30px"
                me="7px"
              >
                <Icon w="18px" h="18px" color={iconColor} as={RestartIcon} />
              </Flex>
              <Text
                w="max-content"
                color={badgeColor}
                fontSize="sm"
                fontWeight="600"
                me="6px"
              >
                Start
              </Text>
            </Button>
            </Tooltip>
          )}
        </Center>
      )}

      {/* Solo Service */}
      {type === 'solo' && (
        <Center>
          {(soloOnline === 'online' || soloOnline === 'pending') && (
            <>
              <Button
                ms="auto"
                p="6px"
                align="center"
                me="6px"
                bgColor={badgeBox}
                onClick={() => handleSystemAction('stopSolo')}
              >
                <Flex
                  align="center"
                  justify="center"
                  bg={badgeBox}
                  h="32px"
                  w="32px"
                  borderRadius="30px"
                  me="7px"
                >
                  <Icon w="18px" h="18px" color={iconColor} as={StopIcon} />
                </Flex>
                <Text
                  w="max-content"
                  color={badgeColor}
                  fontSize="sm"
                  fontWeight="600"
                  me="6px"
                >
                  Stop
                </Text>
              </Button>

              <Button
                ms="auto"
                p="6px"
                align="center"
                me="6px"
                bgColor={badgeBox}
                onClick={() => handleSystemAction('restartSolo')}
                isDisabled={soloOnline === 'pending'}
              >
                <Flex
                  align="center"
                  justify="center"
                  bg={badgeBox}
                  h="32px"
                  w="32px"
                  borderRadius="30px"
                  me="7px"
                >
                  <Icon w="18px" h="18px" color={iconColor} as={RestartIcon} />
                </Flex>
                <Text
                  w="max-content"
                  color={badgeColor}
                  fontSize="sm"
                  fontWeight="600"
                  me="6px"
                >
                  Restart
                </Text>
              </Button>
            </>
          )}

          {soloOnline === 'offline' && (
            <Button
              ms="auto"
              p="6px"
              align="center"
              me="6px"
              bgColor={badgeBox}
              onClick={() => handleSystemAction('startSolo')}
              isDisabled={soloOnline === 'pending'}
            >
              <Flex
                align="center"
                justify="center"
                bg={badgeBox}
                h="32px"
                w="32px"
                borderRadius="30px"
                me="7px"
              >
                <Icon w="18px" h="18px" color={iconColor} as={RestartIcon} />
              </Flex>
              <Text
                w="max-content"
                color={badgeColor}
                fontSize="sm"
                fontWeight="600"
                me="6px"
              >
                Start
              </Text>
            </Button>
          )}
        </Center>
      )}

      {/* Node */}
      {type === 'node' && (
        <Center>
          {(nodeOnline === 'online' || nodeOnline === 'pending') && (
            <Button
              ms="auto"
              p="6px"
              align="center"
              me="6px"
              bgColor={badgeBox}
              onClick={() => handleSystemAction('stopNode')}
            >
              <Flex
                align="center"
                justify="center"
                bg={badgeBox}
                h="32px"
                w="32px"
                borderRadius="30px"
                me="7px"
              >
                <Icon w="18px" h="18px" color={iconColor} as={StopIcon} />
              </Flex>
              <Text
                w="max-content"
                color={badgeColor}
                fontSize="sm"
                fontWeight="600"
                me="6px"
              >
                Stop
              </Text>
            </Button>
          )}

          {nodeOnline === 'offline' && (
            <Button
              ms="auto"
              p="6px"
              align="center"
              me="6px"
              bgColor={badgeBox}
              onClick={() => handleSystemAction('startNode')}
              isDisabled={nodeOnline === 'pending'}
            >
              <Flex
                align="center"
                justify="center"
                bg={badgeBox}
                h="32px"
                w="32px"
                borderRadius="30px"
                me="7px"
              >
                <Icon w="18px" h="18px" color={iconColor} as={RestartIcon} />
              </Flex>
              <Text
                w="max-content"
                color={badgeColor}
                fontSize="sm"
                fontWeight="600"
                me="6px"
              >
                Start
              </Text>
            </Button>
          )}
        </Center>
      )}
    </Flex>
  );
};

export default NavbarSeconday;
