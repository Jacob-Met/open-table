# OPEN TABLE — Devpost Submission

## Track
Coding and agentic engineering. The project integrates NVIDIA Nemotron reasoning with deterministic rule-checking to propose and validate adaptive game rules.

## New or Existing
Existing project started before Aug 26, 2026. The original offline game framework, deterministic checker, UI, and test suite were developed earlier. The Nemotron integration for live proposal generation is the new hackathon work, replacing the authored test examples with real model inference.

## Models Used and Why
**NVIDIA Nemotron 3 Super (120B)** via Nebius Token Factory. Chosen because rule adaptation requires strong reasoning over structured game logic: the model must parse game rules, understand access needs, and propose concrete JSON adaptations that the checker will validate. The 120B size provides the reasoning depth needed for multi-step logic (game states, legal moves, information sets) without requiring fine-tuning.

## Nemotron Output Quality
**8/10.** The model consistently produces valid JSON with sensible rule changes aligned to access needs. It correctly identifies game components and proposes targeted adaptations (e.g., adding verbal labels to visual markers). Quality is limited only by the fact that human playtesting would validate whether proposed adaptations actually improve accessibility—the checker only verifies that the adaptation preserves game strategy, not that it solves the human problem.

## Approach
Out of box. No fine-tuning. Prompting uses the authored catalog and deterministic parser to keep the request-response contract tight and checkable.

## Comparison to Other Models
Not compared in this work. Nemotron was chosen to match the hackathon mandate. Smaller models might struggle with multi-step game logic; larger models would be slower and costlier without clear benefit. The value here is the integration (model proposes, deterministic checker validates) rather than raw model capability.

## Most Valuable Nebius Capability
**Token Factory API access.** The OpenAI-compatible /chat/completions endpoint made integration straightforward: drop in the Nemotron model ID, point at Token Factory, and the existing client libraries handle the rest. No vendor lock-in, no proprietary client needed. For a game-adaptation tool, the ability to call a reasoning model from a server (keeping the API key secure) is essential. Token Factory's straightforward interface made that practical.

## Recommendation Score
**8/10.** The product solves a real problem (how to adapt games for different access needs while proving the adaptation works), integrates a reasoning model meaningfully, and maintains a clear user experience. The offline path works; live proposals work; the validator catches bad adaptations. The limitation is that this is a prototype in the hands of designers, not a finished product deployed to players.

## Experience Score
**8/10.** The UI is clean and responsive. The workflow is clear: describe a need, ask Nemotron, review the proposal, save the pack. The deterministic validator provides confidence. The app runs locally with no setup beyond `npm install`. The limitation is that the demo is scripted and the real experience depends on whether proposed adaptations actually improve play for the intended audience (a human usability question outside the model and checker).

## Improvements Wanted
- Live human playtesting with players having the stated access needs, with adaptations proposed by Nemotron.
- Support for more games beyond Beacon Steps and Pocket Signals.
- Screen reader support and keyboard-only play across all modes.
- A remote multiplayer path (currently local pass-and-play only).

## What You Hope to See Next from Nemotron
Stronger support for structured output. Nemotron already handles JSON well, but explicit training or a dedicated structured-output mode could reduce the need for repair turns (cases where Nemotron returns invalid JSON and the app asks it to fix it). For this use case, a ~90% first-try JSON success rate would cut network calls in half.

## AI Tools Used While Building
- **Claude Code** (this session): integrated Nemotron into the server, wrote tests, updated documentation, created the demo script.
- No other AI tools used in the workflow; the game rules, UI, and validator were authored by hand.

## About the Project

OPEN TABLE is a tool for game designers and accessibility advocates to explore whether a tabletop game can be adapted to meet a specific player's access need **while preserving the game's original strategic depth.**

The problem: when a player describes an access need (e.g., "I need the marker position stated in words, not just shown"), a designer must hand-craft an adapted version of the rules, then verify that the adaptation doesn't accidentally break the game's balance, information hiding, or fair play. That verification is tedious and error-prone.

The solution: **Nemotron proposes the adaptation; a deterministic checker validates it.**

The workflow:
1. A player describes an access need in plain English.
2. The app prepares a structured request (game rules + need) and sends it to Nemotron on Nebius.
3. Nemotron responds with a JSON proposal naming specific changes (e.g., "Add word labels to visual markers").
4. The app's independent validator simulates every reachable game state under both the original and adapted rules, comparing legal moves, information sets, and outcomes.
5. If the validator confirms equivalence, the pack is saved and the player can play with the adapted rules.

Two original games (Beacon Steps, a public-information race; Pocket Signals, a private-card game) are included as references. Both are simple enough to verify exhaustively, but complex enough to show real information-hiding and strategy.

This is a **design tool and a prototype**, not a finished product for end players. It demonstrates that rule adaptation can be both human-proposed and machine-validated, and that the validation matters: some "sensible" adaptations fail the checker because they silently change what information players have.

The work here was driven by the observation that accessibility in games is often framed as a UI problem (bigger text, sounds, etc.) when it's also a rules problem. A player who can't see colors might need different move markers; a player with low vision might need rules stated in words; a player with limited working memory might benefit from rules that reduce pending state. OPEN TABLE is a first sketch of what it might look like to propose and validate those changes automatically.

## Built With
- Node.js 22
- NVIDIA Nemotron 3 Super (120B) on Nebius Token Factory
- No external npm dependencies (single-file HTML build also available)
- Vanilla JavaScript, HTML, CSS
