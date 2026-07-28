import React, { useState, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  Text,
  UnorderedList,
  ListItem,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { useIntl } from 'react-intl';
import { useLazyQuery } from '@apollo/client';
import { MdDownload } from 'react-icons/md';
import { DIAGNOSTICS_BUNDLE_QUERY } from '../../graphql/diagnostics';

/**
 * Download a support bundle (device state + logs).
 *
 * The backend redacts it unconditionally, but this file still contains the
 * device's logs — so it is never generated silently: the dialog says what is in
 * it and what was removed, and the user has to confirm before anything is built.
 */
const DiagnosticBundle = () => {
  const intl = useIntl();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef();
  const [failure, setFailure] = useState(null);
  const noteColor = useColorModeValue('gray.600', 'gray.400');

  const [fetchBundle, { loading }] = useLazyQuery(DIAGNOSTICS_BUNDLE_QUERY, {
    fetchPolicy: 'no-cache',
    onCompleted: (data) => {
      const payload = data?.Diagnostics?.bundle;
      if (payload?.error || !payload?.result) {
        setFailure(
          payload?.error?.message ||
            intl.formatMessage({ id: 'settings.sections.system.diagnostics.failed' })
        );
        return;
      }

      // Save straight from memory: the bundle is a string, so no server-side temp
      // file is created and nothing is left on the device afterwards.
      const { filename, content } = payload.result;
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onClose();
    },
    onError: (error) => setFailure(error.message),
  });

  const handleConfirm = () => {
    setFailure(null);
    fetchBundle({ variables: { input: { logLines: 500 } } });
  };

  const handleOpen = () => {
    setFailure(null);
    onOpen();
  };

  return (
    <Box>
      <Flex direction={{ base: 'column', md: 'row' }} align={{ md: 'center' }} gap={3}>
        <Box flex="1">
          <Text fontSize="sm" color={noteColor}>
            {intl.formatMessage({ id: 'settings.sections.system.diagnostics.description' })}
          </Text>
        </Box>
        <Button
          leftIcon={<MdDownload />}
          onClick={handleOpen}
          isLoading={loading}
          loadingText={intl.formatMessage({
            id: 'settings.sections.system.diagnostics.generating',
          })}
          variant="outline"
          minWidth="200px"
        >
          {intl.formatMessage({ id: 'settings.sections.system.diagnostics.download' })}
        </Button>
      </Flex>

      <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              {intl.formatMessage({ id: 'settings.sections.system.diagnostics.confirm.title' })}
            </AlertDialogHeader>

            <AlertDialogBody>
              <Text mb={3}>
                {intl.formatMessage({
                  id: 'settings.sections.system.diagnostics.confirm.includes',
                })}
              </Text>
              <UnorderedList mb={3} fontSize="sm" color={noteColor}>
                <ListItem>
                  {intl.formatMessage({
                    id: 'settings.sections.system.diagnostics.confirm.item.state',
                  })}
                </ListItem>
                <ListItem>
                  {intl.formatMessage({
                    id: 'settings.sections.system.diagnostics.confirm.item.logs',
                  })}
                </ListItem>
              </UnorderedList>
              <Text fontSize="sm">
                {intl.formatMessage({
                  id: 'settings.sections.system.diagnostics.confirm.redaction',
                })}
              </Text>
              {failure && (
                <Text mt={3} color="red.500" fontSize="sm">
                  {failure}
                </Text>
              )}
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose} variant="ghost">
                {intl.formatMessage({ id: 'settings.sections.system.diagnostics.confirm.cancel' })}
              </Button>
              <Button colorScheme="blue" onClick={handleConfirm} isLoading={loading} ml={3}>
                {intl.formatMessage({ id: 'settings.sections.system.diagnostics.confirm.accept' })}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

export default DiagnosticBundle;
