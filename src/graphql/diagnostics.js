import { gql } from '@apollo/client';
import { ERROR_FRAGMENT } from './fragments/error';

export const DIAGNOSTICS_BUNDLE_QUERY = gql`
  ${ERROR_FRAGMENT}
  query DIAGNOSTICS_BUNDLE($input: DiagnosticsBundleInput) {
    Diagnostics {
      bundle(input: $input) {
        result {
          filename
          content
          sizeBytes
          generatedAt
        }
        error {
          ...ErrorFragment
        }
      }
    }
  }
`;
