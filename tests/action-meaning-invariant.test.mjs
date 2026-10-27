import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/games.js';
import {createAdapter, checkAdaptation} from '../src/adaptations.js';

const pocket = 'pocket-signals';
const commit = (player, card) => ({type: 'commit', player, card});
function deal(own, other) {
  const state = game.initialStates(pocket).find(s =>
    JSON.stringify(s.hands) === JSON.stringify([own, other]));
  assert.ok(state, 'The independent witness must be an original reachable deal.');
  return state;
}
// Keep observations and visible choice identities honest. Only vary the
// correspondence between a visible slot and an otherwise legal base action.
function permuted(reverse) {
  const base = createAdapter('shape-text');
  const candidate = {
    ...base,
    actions(state, player) {
      return base.actions(state, player).map((choice, index) =>
        ({id: 'slot-' + index, label: 'Slot ' + (index + 1)}));
    },
    decode(state, player, id) {
      const index = candidate.actions(state, player).findIndex(c => c.id === id);
      if (index < 0) throw new Error('Unavailable slot.');
      const legal = game.legalActions(state, player);
      return structuredClone(legal[reverse(state, player) ? legal.length - 1 - index : index]);
    },
    step(state, player, id) {
      return game.step(state, candidate.decode(state, player, id));
    }
  };
  return candidate;
}
function assertEquivalent(candidate) {
  const result = checkAdaptation(pocket, candidate);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.complete, true);
  assert.equal(result.states, 450);
  assert.equal(result.transitions, 420);
}
function assertMeaningWitness(candidate, result, expectedPlayer) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.complete, false);
  assert.equal(result.verdict, 'rejected');
  assert.equal(result.reason, 'action-meaning');
  const {left, right, player, choiceId} = result.counterexample;
  if (expectedPlayer !== undefined) assert.equal(player, expectedPlayer);
  assert.equal(typeof choiceId, 'string');
  assert.deepEqual(left.baseView, right.baseView);
  assert.deepEqual(left.adaptedView, right.adaptedView);
  assert.notDeepEqual(left.decodedAction, right.decodedAction);
  for (const side of [left, right]) {
    assert.deepEqual(side.trace.reduce((s, a) => game.step(s, a), side.initialState), side.state);
    assert.deepEqual(candidate.decode(side.state, player, choiceId), side.decodedAction);
    assert.ok(game.legalActions(side.state, player).some(a =>
      JSON.stringify(a) === JSON.stringify(side.decodedAction)));
  }
  // A retained JSON witness must reproduce the same original game states.
  const saved = JSON.parse(JSON.stringify(result.counterexample));
  for (const side of [saved.left, saved.right])
    assert.deepEqual(side.trace.reduce((s, a) => game.step(s, a), side.initialState), side.state);
}

test('independent paired play exposes a hidden-hand-dependent button meaning', () => {
  const a = deal([1, 4], [2, 3]), b = deal([1, 4], [2, 5]);
  const candidate = permuted((s, p) => s.hands[1 - p].includes(5));
  assert.deepEqual(game.observe(a, 0), game.observe(b, 0));
  assert.deepEqual(candidate.actions(a, 0), candidate.actions(b, 0));
  assert.deepEqual(candidate.decode(a, 0, 'slot-0'), commit(0, 1));
  assert.deepEqual(candidate.decode(b, 0, 'slot-0'), commit(0, 4));
  const nextA = candidate.step(a, 0, 'slot-0'), nextB = candidate.step(b, 0, 'slot-0');
  assert.deepEqual(nextA, game.step(a, commit(0, 1)));
  assert.deepEqual(nextB, game.step(b, commit(0, 4)));
  assert.deepEqual(game.outcome(game.step(nextA, commit(1, 2))).scores, [0, 1]);
  assert.deepEqual(game.outcome(game.step(nextB, commit(1, 2))).scores, [1, 0]);
  assertMeaningWitness(candidate, checkAdaptation(pocket, candidate), 0);
});

test('a hidden pending commitment cannot steer the other player\'s same visible choice', () => {
  const source = deal([1, 4], [2, 3]);
  const low = game.step(source, commit(0, 1)), high = game.step(source, commit(0, 4));
  const candidate = permuted((s, p) => p === 1 && s.committed[0] === 4);
  assert.deepEqual(game.observe(low, 1), game.observe(high, 1));
  assert.deepEqual(candidate.actions(low, 1), candidate.actions(high, 1));
  assert.notDeepEqual(candidate.decode(low, 1, 'slot-0'), candidate.decode(high, 1, 'slot-0'));
  assertMeaningWitness(candidate, checkAdaptation(pocket, candidate), 1);
});

test('a consistent renamed or reversed action mapping remains equivalent', () => {
  assertEquivalent(permuted(() => false));
  assertEquivalent(permuted(() => true));
});

test('different observed hands may legitimately use different action mappings', () => {
  const candidate = permuted((s, p) => s.hands[p].includes(4));
  const a = deal([1, 4], [2, 3]), b = deal([1, 5], [2, 3]);
  assert.notDeepEqual(game.observe(a, 0), game.observe(b, 0));
  assert.deepEqual(candidate.decode(a, 0, 'slot-0'), commit(0, 4));
  assert.deepEqual(candidate.decode(b, 0, 'slot-0'), commit(0, 1));
  assertEquivalent(candidate);
});

test('player-specific mappings remain independent', () => {
  assertEquivalent(permuted((_s, p) => p === 1));
});

test('the two maintained preserving modes still cover the complete game', () => {
  assertEquivalent('shape-text');
  assertEquivalent('switch-select');
});
