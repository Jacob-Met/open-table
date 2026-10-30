// Server-side only. This module is never served to the browser: the Nebius key
// stays in the server process and is sent only to the Token Factory endpoint.
import {prepareAuthorRequest} from './author-request.js';
import {getCatalog} from './catalog.js';
import {parseModelProposal} from './model-proposal.js';
import {checkAdaptation} from './adaptations.js';

export const NEBIUS_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
export const DEFAULT_NEMOTRON_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
// Reasoning models spend tokens before the answer, so the budget is generous.
export const NEMOTRON_MAX_TOKENS = 4000;
export const GAME_IDS = ['beacon-steps', 'pocket-signals'];

export class ProposalError extends Error {
  constructor(code, message) { super(message); this.name = 'ProposalError'; this.code = code; }
}

export function nemotronConfig(env = process.env) {
  return {
    apiKey: (env.NEBIUS_API_KEY || '').trim(),
    model: (env.NEBIUS_MODEL || DEFAULT_NEMOTRON_MODEL).trim(),
    baseUrl: (env.NEBIUS_BASE_URL || NEBIUS_BASE_URL).trim().replace(/\/+$/, ''),
  };
}

// One OpenAI-compatible chat completion. Only message.content is used as the answer.
export async function callNemotron(messages, { apiKey, model, baseUrl = NEBIUS_BASE_URL, fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  if (!apiKey) throw new ProposalError('unconfigured', 'Nemotron is off. Set NEBIUS_API_KEY on the server to ask Nemotron on Nebius Token Factory.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(baseUrl + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages, max_tokens: NEMOTRON_MAX_TOKENS, temperature: 0.2 }),
    });
    if (!response.ok) throw new ProposalError('upstream', 'Nebius Token Factory answered with HTTP ' + response.status + '. No proposal was checked.');
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new ProposalError('empty', 'Nemotron returned no answer text. No proposal was checked.');
    return { content, model: typeof body.model === 'string' ? body.model : model };
  } catch (error) {
    if (error instanceof ProposalError) throw error;
    const reason = error?.name === 'AbortError' ? 'the request timed out' : 'the request failed';
    throw new ProposalError('network', 'Nebius Token Factory could not be reached: ' + reason + '. No proposal was checked.');
  } finally {
    clearTimeout(timer);
  }
}

// Models sometimes wrap JSON in a fence. Strip one fence; the validator still decides.
export function stripFence(text) {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function summarize(result) {
  return {
    verdict: result.verdict,
    ok: result.ok,
    complete: result.complete,
    reason: result.ok ? null : result.reason,
    states: result.states,
    transitions: result.transitions,
    scope: result.scope || null,
  };
}

// The model proposes; the authored parser validates; the finite checker decides.
export async function proposeAdaptation({ gameId, accessGoal }, { config, fetchImpl } = {}) {
  if (!GAME_IDS.includes(gameId)) throw new ProposalError('input', 'Choose one of the two games.');
  let request;
  try { request = prepareAuthorRequest(gameId, accessGoal); }
  catch (error) { throw new ProposalError('input', error.message); }
  const catalog = getCatalog(gameId);
  // One repair turn at most: the validator's message goes back to the model, and the
  // answer is still only accepted if the same authored validator passes it.
  let reply = await callNemotron(request.messages, { ...config, fetchImpl });
  let proposal, attempts = 1;
  try { proposal = parseModelProposal(stripFence(reply.content), catalog); }
  catch (firstError) {
    attempts = 2;
    const repair = [...request.messages,
      { role: 'assistant', content: reply.content },
      { role: 'user', content: 'The answer failed the proposal checks: ' + firstError.message + '. Return only the corrected JSON object, with exactly the required fields and no other text.' }];
    reply = await callNemotron(repair, { ...config, fetchImpl });
    try { proposal = parseModelProposal(stripFence(reply.content), catalog); }
    catch (error) {
      throw new ProposalError('invalid', 'Nemotron answered twice, but neither answer passed the proposal checks: ' + error.message);
    }
  }
  const checks = proposal.classification === 'equivalence-candidate'
    ? [...new Set(proposal.changes.map(change => change.adapter))].map(pack => ({ pack, result: summarize(checkAdaptation(gameId, pack)) }))
    : [];
  return { live: true, model: reply.model, attempts, gameId, classification: proposal.classification, proposal, checks };
}
