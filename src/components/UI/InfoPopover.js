import {
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';

// The "i" that opens an explanation, instead of the explanation sitting open
// in the page. Same icon and colours as the info marks on the solo mining
// page; a popover rather than a hover tooltip, so it also opens from the
// keyboard (Enter/Space on the focused button, Esc closes) and on a touch
// screen, where there is no hover.
//
// `label` names the button for screen readers — the visible mark is only an icon.
const InfoPopover = ({ label, children, placement = 'top-start' }) => {
  const bg = useColorModeValue('gray.100', 'brand.700');
  const color = useColorModeValue('gray.800', 'white');
  const iconColor = useColorModeValue('secondaryGray.500', 'secondaryGray.500');

  return (
    <Popover placement={placement} isLazy>
      <PopoverTrigger>
        <IconButton
          aria-label={label}
          icon={<InfoIcon boxSize={3.5} color={iconColor} />}
          variant="ghost"
          size="xs"
          minW="auto"
          h="auto"
          p="1"
        />
      </PopoverTrigger>
      <PopoverContent bg={bg} color={color} borderRadius="lg" boxShadow="xl" w="auto" maxW="min(360px, 90vw)">
        <PopoverArrow bg={bg} />
        <PopoverBody p="4">
          <Text fontSize="sm">{children}</Text>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default InfoPopover;
