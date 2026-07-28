import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Badge,
  Box,
  Code,
  Select,
  Spinner,
  useColorModeValue,
  Tooltip,
  IconButton,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  FormControl,
  FormLabel,
  Flex,
  Text,
} from '@chakra-ui/react';
import { useLazyQuery } from '@apollo/client';
import { useDispatch, useSelector } from 'react-redux';
import { LOGS_READ_QUERY } from '../../graphql/logs';
import { updateLogs } from '../../redux/slices/logsSlice';
import { MdRefresh, MdContentCopy } from 'react-icons/md';
import moment from 'moment';
import { useDeviceType } from '../../contexts/DeviceConfigContext';
import {
  parseLogContent,
  availableLevels,
  availableComponents,
  filterEntries,
  LEVEL_COLORS,
} from './parsePinoLine';

export const LOG_TYPES = [
  { value: 'CKPOOL', label: 'Apollo Solo' },
  { value: 'MINER', label: 'Bitcoin Miner' },
  { value: 'NODE', label: 'Bitcoin Node' },
  { value: 'APOLLO_API', label: 'Apollo API' },
  { value: 'SYSLOG', label: 'System' },
];

const LogsViewer = ({ 
  initialLogType = 'CKPOOL',
  initialLines = 20,
  initialAutoRefresh = true,
  refreshInterval = 5000,
  showHeader = true,
  height = '400px'
}) => {
  const deviceType = useDeviceType();
  
  // Filter log types based on device type
  const getAvailableLogTypes = () => {
    if (deviceType === 'solo-node') {
      // Hide miner logs for solo-node devices
      return LOG_TYPES.filter(type => type.value !== 'MINER');
    }
    
    return LOG_TYPES;
  };
  
  const availableLogTypes = getAvailableLogTypes();
  
  // Ensure initial log type is available for the current device type
  const getValidInitialLogType = () => {
    if (deviceType === 'solo-node' && initialLogType === 'MINER') {
      return 'CKPOOL'; // Default to CKPOOL if MINER is not available
    }
    return initialLogType;
  };
  
  const [logType, setLogType] = useState(getValidInitialLogType());
  const [lines, setLines] = useState(initialLines);
  const [minLevel, setMinLevel] = useState('');
  const [component, setComponent] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef(null);
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector((state) => state.logs);
  const codeBackground = useColorModeValue('gray.200', 'gray.700');
  const inputTextColor = useColorModeValue('gray.900', 'gray.100');
  const placeholderColor = useColorModeValue('gray.500', 'gray.500');

  const [getLogs, { loading: queryLoading, error: queryError, data: queryData }] = useLazyQuery(LOGS_READ_QUERY, {
    fetchPolicy: 'no-cache',
    onCompleted: (data) => {
      dispatch(
        updateLogs({
          data,
          loading: false,
          error: null,
        })
      );
    },
    onError: (error) => {
      dispatch(
        updateLogs({
          data: null,
          loading: false,
          error,
        })
      );
    },
  });

  const fetchLogs = useCallback(() => {
    setIsLoadingLogs(true);
    const startTime = Date.now();

    getLogs({
      variables: {
        input: {
          logType,
          lines,
        },
      },
      onCompleted: () => {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, 1000 - elapsedTime);

        setTimeout(() => {
          setIsLoadingLogs(false);
        }, remainingTime);
      },
      onError: () => {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, 1000 - elapsedTime);

        setTimeout(() => {
          setIsLoadingLogs(false);
        }, remainingTime);
      },
    });
  }, [logType, lines, getLogs]);

  useEffect(() => {
    fetchLogs();
    let intervalRef = null;

    if (autoRefresh) {
      intervalRef = setInterval(fetchLogs, refreshInterval);
    }

    return () => {
      if (intervalRef) {
        clearInterval(intervalRef);
      }
    };
  }, [logType, lines, autoRefresh, fetchLogs, refreshInterval]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [data]);

  const handleCopyLogs = () => {
    const content = queryData?.Logs?.read?.result?.content;
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const logContent = queryData?.Logs?.read?.result?.content || '';
  const timestamp = queryData?.Logs?.read?.result?.timestamp
    ? moment(queryData.Logs.read.result.timestamp).format('YYYY-MM-DD HH:mm:ss')
    : '';

  // The backend logs structured JSON; the other units don't. Parse per line and
  // only offer the level/component filters when this batch actually has entries
  // to filter — otherwise the controls would be dead weight on a ckpool log.
  const entries = useMemo(() => parseLogContent(logContent), [logContent]);
  const levels = useMemo(() => availableLevels(entries), [entries]);
  const components = useMemo(() => availableComponents(entries), [entries]);
  const isStructured = levels.length > 0;
  const visibleEntries = useMemo(
    () => filterEntries(entries, { minLevel, component }),
    [entries, minLevel, component]
  );

  // A filter that outlives the batch it was chosen from would silently show
  // nothing (switch to a log with no such component and the pane goes blank).
  useEffect(() => {
    if (component && !components.includes(component)) setComponent('');
  }, [components, component]);

  return (
    <Box>
      {showHeader && (
        <Flex mb={4} gap={2} flexWrap="wrap">
          <Tooltip label="Log to display">
            <Select
              value={logType}
              onChange={(e) => setLogType(e.target.value)}
              width={{ base: 'full', md: '200px' }}
              mr={2}
            >
              {availableLogTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Tooltip>

          <Tooltip label="Number of lines to display">
            <NumberInput
              min={10}
              max={1000}
              step={10}
              value={lines}
              onChange={(valueString) => setLines(parseInt(valueString))}
              width={{ base: 'full', md: '150px' }}
              mr={2}
            >
              <NumberInputField
                placeholder="Lines"
                color={inputTextColor}
                _placeholder={{
                  color: placeholderColor,
                }}
              />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </Tooltip>

          <FormControl display="flex" alignItems="center" width="auto">
            <FormLabel htmlFor="auto-refresh" mb="0" mr={2}>
              Auto-refresh
            </FormLabel>
            <Switch
              id="auto-refresh"
              isChecked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </FormControl>

          <Tooltip label="Refresh logs now">
            <IconButton
              icon={isLoadingLogs ? <Spinner size="sm" /> : <MdRefresh />}
              onClick={fetchLogs}
              isLoading={isLoadingLogs}
              aria-label="Refresh logs"
            />
          </Tooltip>

          {isStructured && (
            <>
              <Tooltip label="Minimum severity">
                <Select
                  value={minLevel}
                  onChange={(e) => setMinLevel(e.target.value)}
                  width={{ base: 'full', md: '140px' }}
                  mr={2}
                >
                  <option value="">All levels</option>
                  {levels.map((level) => (
                    <option key={level} value={level}>
                      {level} +
                    </option>
                  ))}
                </Select>
              </Tooltip>

              {components.length > 1 && (
                <Tooltip label="Component">
                  <Select
                    value={component}
                    onChange={(e) => setComponent(e.target.value)}
                    width={{ base: 'full', md: '170px' }}
                    mr={2}
                  >
                    <option value="">All components</option>
                    {components.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Tooltip>
              )}
            </>
          )}

          <Tooltip label={copied ? 'Copied!' : 'Copy logs'}>
            <IconButton
              icon={<MdContentCopy />}
              onClick={handleCopyLogs}
              aria-label="Copy logs"
              ml="auto"
            />
          </Tooltip>
        </Flex>
      )}

      <Box
        position="relative"
        height={height}
        overflowY="auto"
        bg={codeBackground}
        borderRadius="md"
        p={4}
        fontFamily="mono"
        ref={logContainerRef}
      >
        {loading && (
          <Flex position="absolute" top={0} right={2} p={2} zIndex={1}>
            <Spinner size="sm" />
          </Flex>
        )}

        {error && (
          <Text color="red.500">Error loading logs: {error.message}</Text>
        )}

        {isStructured ? (
          <Box fontSize="sm" fontFamily="mono">
            {visibleEntries.length === 0 && (
              <Text color="gray.500">No entries match the current filter</Text>
            )}
            {visibleEntries.map((entry, index) =>
              entry.parsed ? (
                <Flex key={index} gap={2} py="2px" align="baseline" wrap="wrap">
                  <Text color="gray.500" flexShrink={0}>
                    {entry.time ? moment(entry.time).format('HH:mm:ss') : ''}
                  </Text>
                  <Badge colorScheme={LEVEL_COLORS[entry.level] || 'gray'} flexShrink={0}>
                    {entry.level}
                  </Badge>
                  {entry.component && (
                    <Badge variant="outline" flexShrink={0}>
                      {entry.component}
                    </Badge>
                  )}
                  <Text as="span" wordBreak="break-word">
                    {entry.msg}
                  </Text>
                  {entry.fields && (
                    <Text as="span" color="gray.500" wordBreak="break-all">
                      {JSON.stringify(entry.fields)}
                    </Text>
                  )}
                </Flex>
              ) : (
                <Text key={index} whiteSpace="pre-wrap" wordBreak="break-word" py="2px">
                  {entry.raw}
                </Text>
              )
            )}
          </Box>
        ) : (
          <Code
            w="100%"
            bg="transparent"
            whiteSpace="pre-wrap"
            fontSize="sm"
            display="block"
          >
            {logContent || 'No logs to display'}
          </Code>
        )}
      </Box>

      {showHeader && timestamp && (
        <Text fontSize="sm" color="gray.500" mt={2}>
          Last updated: {timestamp}
        </Text>
      )}
    </Box>
  );
};

export default LogsViewer; 