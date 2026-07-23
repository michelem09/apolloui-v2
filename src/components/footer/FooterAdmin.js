/*eslint-disable*/
import React from 'react';
import {
  Flex,
  Link,
  List,
  ListItem,
  Text,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { FormattedMessage } from 'react-intl';

import { useQuery } from '@apollo/client';
import config from '../../config';
import { getVersionFromPackageJson } from '../../lib/utils';
import { MCU_VERSION_QUERY } from '../../graphql/mcu';
import LanguageSelector from '../language/LanguageSelector';

const FooterAdmin = () => {
  const textColor = useColorModeValue('gray.800', 'white');
  const { toggleColorMode } = useColorMode();

  // The version the device is actually RUNNING, not the one bundled at build
  // time. version.json is written by the updater from the release it installed
  // (Mcu.version.installed), while getVersionFromPackageJson reads the package
  // baked into this bundle — after a tarball update the two differ, so the
  // footer showed 2.2.0 on a device running 2.2.1-rc20. cache-first reuses the
  // navbar's query, so this adds no network request.
  const { data } = useQuery(MCU_VERSION_QUERY, { fetchPolicy: 'cache-first' });
  const version = data?.Mcu?.version?.installed || getVersionFromPackageJson();

  return (
    <Flex
      zIndex='3'
      flexDirection={{
        base: 'column',
        xl: 'row',
      }}
      alignItems={{
        base: 'center',
        xl: 'start',
      }}
      justifyContent='space-between'
      px={{ base: '30px', md: '50px' }}
      pb='30px'
    >
      <Text
        color={textColor}
        textAlign={{
          base: 'center',
          xl: 'start',
        }}
        mb={{ base: '20px', xl: '0px' }}
      >
        {' '}
        &copy; {1900 + new Date().getYear()}{' '}
        <Text as='span' fontWeight='500'>
          <FormattedMessage
            id="footer.made_with_love"
            values={{ version }}
          />{' '}
          <Link
            color={textColor}
            href={config.mainWebsite}
            target='_blank'
            fontWeight='700'
          >
            <FormattedMessage id="footer.futurebit" />
          </Link>
        </Text>
      </Text>
      <Flex alignItems="center" gap="20px">
        <LanguageSelector />
        <List display='flex'>
          {config.footerLinks.map((item, index) => {
            return (
              <ListItem
                me={{
                  base: '20px',
                  md: '44px',
                }}
                key={index}
              >
                <Link fontWeight='500' color={textColor} href={item.url}>
                  <FormattedMessage id={item.anchor} />
                </Link>
              </ListItem>
            );
          })}
        </List>
      </Flex>
    </Flex>
  );
};

export default FooterAdmin;
