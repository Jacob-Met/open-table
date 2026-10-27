import * as game from './games.js';

export const ADAPTATION_MODES = ['shape-text', 'switch-select', 'drop-action', 'reveal-opponent'];
const players = [0, 1];
const shapes = ['', '● circle', '▲ triangle', '■ square', '◆ diamond', '★ star'];
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export function createAdapter(mode) {
  if (!ADAPTATION_MODES.includes(mode)) throw new Error('Unknown controlled adaptation mode.');
  const adapter = {
    mode,
    actions(state, player) {
      const legal = game.legalActions(state, player);
      const offered = mode === 'drop-action' ? legal.slice(0, -1) : legal;
      return offered.map((action, index) => {
        const n = action.type === 'advance' ? action.steps : action.card;
        const text = action.type === 'advance' ? 'Advance ' + n : 'Commit ' + n;
        const label = mode === 'shape-text' ? text + ' · ' + shapes[n]
          : mode === 'switch-select' ? 'Choice ' + (index + 1) + ': ' + text : text;
        return { id: String(index), label };
      });
    },
    decode(state, player, id) {
      if (!adapter.actions(state, player).some(choice => choice.id === id)) throw new Error('That choice is not available to this player.');
      return structuredClone(game.legalActions(state, player)[Number(id)]);
    },
    step(state, player, id) { return game.step(state, adapter.decode(state, player, id)); },
    observe(state, player) {
      const view = game.observe(state, player);
      if (mode === 'reveal-opponent' && state.game === 'pocket-signals') return { ...view, opponentPrivate: {
        hand: [...state.hands[1 - player]], pendingCard: state.committed[1 - player]
      } };
      return view;
    },
    outcome: game.outcome
  };
  return adapter;
}
// Candidate objects are authored code/tests. Model proposals select a fixed mode only.
export function checkAdaptation(gameId, candidate, { maxStates = 10000 } = {}) {
  if (!Number.isInteger(maxStates) || maxStates < 1) throw new Error('Invalid state bound.');
  const adapter = typeof candidate === 'string' ? createAdapter(candidate) : candidate;
  // Isolate reference state and retained evidence from candidate mutation/aliasing.
  const fromAdapter = (method, state, ...args) => structuredClone(adapter[method](structuredClone(state), ...args));
  const roots = game.initialStates(gameId), queue = [], seen = new Set();
  const byBase = players.map(() => new Map()), byAdapted = players.map(() => new Map());
  const counts = { states: 0, transitions: 0 };
  let current = null;
  function add(state, initial, trace) {
    const id = game.stateKey(state);
    if (seen.has(id)) return;
    if (seen.size >= maxStates) throw new Error('STATE_BOUND');
    seen.add(id); queue.push({ state, initial, trace });
  }
  function snapshot(entry) { return structuredClone({ initial: entry.initial, initialState: roots[entry.initial], trace: entry.trace, state: entry.state }); }
  function failure(reason, detail = {}) {
    return { ok: false, complete: false, verdict: 'rejected', gameId, ...counts,
      reason, counterexample: { ...(current ? snapshot(current) : {}), ...detail } };
  }
  function pairFailure(reason, player, prior, present) {
    return failure(reason, { player,
      left: { ...snapshot(prior.entry), baseView: prior.baseView, adaptedView: prior.adaptedView },
      right: { ...snapshot(present.entry), baseView: present.baseView, adaptedView: present.adaptedView }
    });
  }
  try {
    roots.forEach((state, initial) => add(state, initial, []));
    for (let cursor = 0; cursor < queue.length; cursor++) {
      current = queue[cursor]; const state = current.state; counts.states++;
      if (canonical(fromAdapter('outcome', state)) !== canonical(game.outcome(state)))
        return failure('outcome', { expected: game.outcome(state), actual: fromAdapter('outcome', state) });
      for (const player of players) {
        const legal = game.legalActions(state, player), choices = fromAdapter('actions', state, player);
        if (!Array.isArray(choices) || choices.some(c => !c || typeof c.id !== 'string' || typeof c.label !== 'string')
          || new Set(choices.map(c => c.id)).size !== choices.length)
          return failure('legal-actions', { player, detail: 'Choices need unique IDs and text labels.' });
        const decoded = choices.map(choice => fromAdapter('decode', state, player, choice.id));
        const expected = new Set(legal.map(canonical)), actual = new Set(decoded.map(canonical));
        if (choices.length !== legal.length || actual.size !== legal.length || [...expected].some(id => !actual.has(id)))
          return failure('legal-actions', { player, expected: legal, choices, decoded });
        const baseView = { observation: game.observe(state, player), actions: legal };
        const adaptedView = { observation: fromAdapter('observe', state, player), choices };
        const baseKey = canonical(baseView), adaptedKey = canonical(adaptedView);
        const record = { entry: current, baseView, adaptedView, baseKey, adaptedKey };
        const sameBase = byBase[player].get(baseKey), sameAdapted = byAdapted[player].get(adaptedKey);
        if (sameBase && sameBase.adaptedKey !== adaptedKey) return pairFailure('information-leak', player, sameBase, record);
        if (sameAdapted && sameAdapted.baseKey !== baseKey) return pairFailure('information-loss', player, sameAdapted, record);
        if (!sameBase) byBase[player].set(baseKey, record);
        if (!sameAdapted) byAdapted[player].set(adaptedKey, record);
        for (let index = 0; index < choices.length; index++) {
          const next = game.step(state, decoded[index]), adaptedNext = fromAdapter('step', state, player, choices[index].id);
          counts.transitions++;
          if (game.stateKey(next) !== game.stateKey(adaptedNext)
            || canonical(game.outcome(next)) !== canonical(fromAdapter('outcome', adaptedNext)))
            return failure('transition', { player, action: decoded[index], choice: choices[index], expected: next, actual: adaptedNext });
          add(next, current.initial, [...current.trace, decoded[index]]);
        }
      }
    }
    return { ok: true, complete: true, verdict: 'equivalent', gameId, ...counts,
      initialStates: roots.length, scope: 'All reachable states of this finite original game.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = failure(message === 'STATE_BOUND' ? 'state-bound' : 'adapter-error', { message });
    if (result.reason === 'state-bound') result.verdict = 'inconclusive';
    return result;
  }
}
