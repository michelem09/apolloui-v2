import {
  MINER_START_MUTATION,
  MINER_STOP_MUTATION,
  MINER_RESTART_MUTATION,
  RESET_BLOCK_FOUND_MUTATION,
} from './miner';
import { SOLO_START_MUTATION, SOLO_STOP_MUTATION, SOLO_RESTART_MUTATION } from './solo';

// A query is re-executed by Apollo Client on a re-render; a miner/solo action
// must never be one.
describe('miner and solo actions are mutation documents', () => {
  it.each([
    ['MINER_START', MINER_START_MUTATION, 'Miner', 'start'],
    ['MINER_STOP', MINER_STOP_MUTATION, 'Miner', 'stop'],
    ['MINER_RESTART', MINER_RESTART_MUTATION, 'Miner', 'restart'],
    ['RESET_BLOCK_FOUND', RESET_BLOCK_FOUND_MUTATION, 'Miner', 'resetBlockFoundFlag'],
    ['SOLO_START', SOLO_START_MUTATION, 'Solo', 'start'],
    ['SOLO_STOP', SOLO_STOP_MUTATION, 'Solo', 'stop'],
    ['SOLO_RESTART', SOLO_RESTART_MUTATION, 'Solo', 'restart'],
  ])('%s', (name, doc, ns, field) => {
    const op = doc.definitions.find((d) => d.kind === 'OperationDefinition');
    expect(op.operation).toBe('mutation');
    expect(op.name.value).toBe(name);
    const outer = op.selectionSet.selections[0];
    expect(outer.name.value).toBe(ns);
    expect(outer.selectionSet.selections[0].name.value).toBe(field);
  });
});
