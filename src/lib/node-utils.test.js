import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { boardKindOf, getMinerHashboardType, getNodeErrorMessage } from './utils';

describe('boardKindOf (internal vs USB hashboard)', () => {
  it('trusts the kind the backend reports', () => {
    expect(boardKindOf({ kind: 'internal' })).toBe('internal');
    expect(boardKindOf({ kind: 'usb', comport: '/dev/ttyS1' })).toBe('usb');
  });
  it('an Apollo III board has no comport and is still internal when the backend says so', () => {
    expect(boardKindOf({ kind: 'internal', comport: undefined })).toBe('internal');
  });
  it('falls back to the comport when the board list has not caught up', () => {
    expect(boardKindOf({ comport: '/dev/ttyS1' })).toBe('internal');
    expect(boardKindOf({ comport: '/dev/ttyACM0' })).toBe('usb');
  });
  it('says nothing when it knows nothing', () => {
    expect(boardKindOf({})).toBeNull();
    expect(boardKindOf()).toBeNull();
  });
});

describe('getMinerHashboardType (translated label)', () => {
  it('internal', () => {
    renderWithProviders(<div>{getMinerHashboardType('internal')}</div>);
    expect(screen.getByText(/Internal/)).toBeInTheDocument();
  });
  it('usb', () => {
    renderWithProviders(<div>{getMinerHashboardType('usb')}</div>);
    expect(screen.getByText(/USB/)).toBeInTheDocument();
  });
  it('unknown kind renders nothing', () => {
    renderWithProviders(<div data-testid="x">{getMinerHashboardType(null)}</div>);
    expect(screen.getByTestId('x')).toBeEmptyDOMElement();
  });
});

describe('getNodeErrorMessage (error → message/type)', () => {
  // intl omitted → getMessage returns the message id, easy to assert.
  it('no error → null sentence, warning', () => {
    expect(getNodeErrorMessage([], null)).toEqual({ sentence: null, type: 'warning' });
  });
  it('ECONNREFUSED → connection_refused', () => {
    expect(getNodeErrorMessage([{ code: 'ECONNREFUSED' }], null).sentence).toBe('node.error.connection_refused');
  });
  it('code -28 (warmup) → starting_up, info', () => {
    const r = getNodeErrorMessage([{ code: -28 }], null);
    expect(r.sentence).toBe('node.error.starting_up');
    expect(r.type).toBe('info');
  });
  it('authentication type → waiting_response, info', () => {
    const r = getNodeErrorMessage([{ type: 'authentication' }], null);
    expect(r.sentence).toBe('node.error.waiting_response');
    expect(r.type).toBe('info');
  });

  // The refused connection is the CONSEQUENCE of having nowhere to run, so the
  // drive is what the user is told about — but only when the node is actually
  // failing. The probe can misread a working setup, and an alert over a node
  // that is answering is a bug report waiting to happen.
  it('explains the drive instead of the RPC error it caused', () => {
    const r = getNodeErrorMessage([{ code: 'ECONNREFUSED' }], null, { state: 'no-drive' });
    expect(r.sentence).toBe('node.storage.no-drive');
    expect(r.type).toBe('info');
  });
  it('stays quiet about the drive while the node is answering', () => {
    expect(getNodeErrorMessage([], null, { state: 'foreign' })).toEqual({
      sentence: null,
      type: 'warning',
    });
  });
});
