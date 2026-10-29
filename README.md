# OPEN TABLE

**Same game. New ways to play.** A private, working prototype for designers and mixed-access play groups: try two original games, choose a presentation, inspect exactly what it preserves, and save a reusable access pack.

This is selected concept 14 in [the estate product workstream](https://github.com/Jacob-Met/hamon/issues/1631#issuecomment-6431153046). It is an original implementation of OPEN TABLE. The earlier TRACEWALK candidate is stopped and checkpointed separately.

![The playable table](docs/images/desktop-table.png)

## Play offline

Download `open-table-0.4.1.html` from the [private 0.4.1 release](https://github.com/Jacob-Met/open-table/releases/tag/v0.4.1) and open it in your browser. The single file contains the game, checker, styles and one-key controls. Playing does not require Node.js, a local server, an account, or a network connection. Use **Play with one key** or append `#one-key` to the file address for direct entry.

Packs remain separate JSON files that you can save and reopen. Closing or reloading the HTML starts a new session. See [offline play, building, and receiving scope](docs/OFFLINE_PLAY.md).

## Run with Node.js

Node.js 22 or later is required. The application has no third-party runtime dependencies and makes no external network requests.

```sh
npm start
```

Open the printed loopback URL, normally `http://127.0.0.1:4287/`. Set `PORT=0` to choose an available port. The server binds only to 127.0.0.1.

The normal start, test, and package commands verify the generated source pins. After deliberately editing the game, adapter, renderer, one-key controller, pack boundary, fixture definitions, or authored catalog, regenerate the pins with `npm run pins`, review the changed binding, and rerun the affected receiving course.

## At the table

**Beacon Steps** is a public-information race. Two players alternate moving one shared marker by one or two spaces. Exact arrival at seven wins; overshooting is illegal. The complete state space contains 14 reachable states and 22 legal transitions.

**Pocket Signals** is a two-round private-card game. Deal each player two different values from 1–5 without replacement; leave one card out. Player 1 commits privately, then Player 2 commits. Reveal both cards together and award one point to the higher card. Repeat with the remaining cards. A final one–one score is a draw. All 30 initial deals together reach 450 states and 420 legal transitions.

The rules use public labels Player 1 and Player 2; engine observer IDs are 0 and 1 respectively.

Choose **Shapes + words** for explicit numbered, named-shape controls, or **Scan + select** for manual cycling or timed scanning followed by explicit confirmation. Scanning alone does not make a move. Automatic scan intervals are 1.4, 2.4, or 4 seconds. Scan + select handles choices within a game. For game selection and the rest of a play session, use **Play with one key** below.

In **Scan + select**, start automatic scanning once to continue across successive turns. The highlight changes without making a move; each confirmation requires a deliberate activation. On **Confirm**, Enter acts on the current choice. Holding Space keeps that choice fixed; releasing Space confirms it once. Moving focus away cancels that Space press and lets automatic scanning continue. See [Space confirmation and receiving scope](docs/SPACE_CONFIRMATION.md). Pocket Signals pauses behind the private handoff curtain. After looking away and passing the device, a fresh press on **Show my hand** reveals the next player’s cards and resumes scanning. Release the key before confirming a choice. **Pause auto scan** stops automatic selection; **Next choice** remains available for manual stepping. See [continuous-scan integration and receiving scope](docs/CONTINUOUS_INTEGRATION.md).

Both original and adapted choices appear for the same acting player. Pocket Signals clears private cards and both choice panels before handing the device over. A repeated held Enter cannot activate the next player's reveal control; a fresh press still works.

This is cooperative **local pass-and-play on a trusted device**. It is not secure remote multiplayer. Full game truth exists in the local application memory; anyone controlling the device or developer tools can inspect it. Players should look away for the other person's private turn.

## Play with one key

Choose **Play with one key** in the access panel, or open the printed address with `#one-key` appended, for example `http://127.0.0.1:4287/#one-key`. The ordinary entry button can be reached with Tab. The direct address starts with the first game focused.

After entry, wait for the outlined button and use **Space or Enter** throughout the play session. Space activates on release; Enter activates on press. Release before making the next choice. Holding either key pauses focus movement, and repeat events cannot activate the next screen. Scanning only changes focus; it never chooses a game, moves a piece, or uncovers a hand.

The focus visits the two games at setup, then the current legal actions or private-hand control, followed by **Pause**, **Pace**, **Choose a game**, and **Exit** as applicable. Both games support completion and **Play again**. **Pace** cycles through 1.4, 2.4, and 4 seconds; it keeps focus so another fresh press can choose a different interval. **Pause** covers a private hand and holds focus on **Resume**. Resume starts a full interval and requires a fresh press to uncover the hand. To reach Pace or Exit with the same key, resume first; the cards stay covered while the focus moves to those controls. **Cover my hand**, **Choose a game**, and **Exit** also cover private cards.

This mode uses the existing Shapes + words actions. Entering it stops Scan + select; exiting restores the previous presentation with automatic scanning paused. The workshop and pack/file controls remain in the ordinary interface.

The maintained browser receiving course checks both games with each key and the transition, privacy, timing, focus, and disposal cases described in [one-key play and receiving scope](docs/ONE_KEY_PLAY.md). This is a keyboard path through a trusted-device play session. Physical switches, screen readers, other browsers, and human access or enjoyment have not been evaluated by that course.

## The workshop

The independent checker enumerates every reachable state of each original game. It compares legal-action bijections, successor states, outcomes, and both directions of each player's information partition. Action labels are part of the observed information, so a label that gives away a hidden card fails. Each visible choice ID must also decode to the same original action across states the player cannot distinguish. A hidden hand or pending move cannot silently change a button's meaning; a rejection retains the conflicting choice and two replayable synthetic worlds in designer diagnostics. Authored candidate functions receive detached inputs and outputs, protecting the reference state and retained witnesses from mutation.

Two intentionally bad designer controls illustrate failure:

- Removing a legal choice is rejected with a concrete action mismatch.
- Revealing the opponent's hand is rejected with two synthetic worlds that look identical in the original game and different in the adaptation.

These examples are separate from the live game. Negative controls cannot activate as access packs. The no-hidden-information Beacon game is not falsely rejected merely because a control is named “reveal opponent.”

Inspecting a negative control does not replace or restart the game at the table. The result names the game being checked; the Pocket Signals leakage example can be inspected while a Beacon Steps match is in progress. The live match and staged proposal are retained. Private cards stay covered and require the usual handoff before they can be revealed again.

A finite equivalence result establishes preservation for these games and fixed, deterministic adapters. It does not establish universal accessibility, enjoyment, usability with a screen reader or physical switch, or equivalence for arbitrary tabletop games. Human access playtests remain necessary.

## Save and reopen

**Save pack** downloads a small JSON selection containing only its schema, game, source pin, candidate classification, and safe adapter. It contains no hands, pending values, live deal identifier, play history, raw state key, or imported proof.

**Open pack** validates the selection, rejects unknown fields, stale pins, variants, and negative controls, and runs the independent checker again before activation. A pack is an adaptation selection, not a saved game or portable certificate.

The SHA-256 binding includes the authored catalog and exact current engine, adapter/checker, renderer, one-key controller, pack implementation, and synthetic fixture source. It is reproducible and has no generated timestamp or randomness. A startup/package gate rejects stale generated pins.

## Grounded proposal authoring

The workshop can review a constrained proposal against approved rule phrases and component references. It renders suggested text as text, rejects permission/rule/certification overrides, invalidates an old review when input changes, and requires explicit author review before checking a supported mode. A `variant` stays an unapproved idea and cannot enter the preserving-pack activation path.

The example is authored test data. **No NVIDIA/Nebius inference has run in this prototype.** The offline experiment prepares four development access goals and two reserved mixed-goal cases from static authored context. It compares a declared deterministic selector with a future actual model response; validity and finite equivalence are kept separate from rationale truth and usefulness.

```sh
node scripts/model-development.mjs
```

This command makes zero provider requests and does not run the reserved cases. Existing authorized account access, a current NVIDIA model on Nebius, and an actual bounded invocation remain dependencies. No keys, model weights, cloud resources, public release, or competition submission are included.

## Verification

```sh
npm test
node scripts/browser-receive.mjs
npm run receive:space
npm run receive:one-key
npm run receive:workshop
python3 scripts/receive-package.py
npm pack
```

The browser course uses the installed Chrome at `/usr/local/bin/google-chrome` and Node's built-in CDP transport. It starts its own loopback server and browser profile, blocks non-loopback page traffic, and closes only the process it launched. Set `OPEN_TABLE_RECEIVING_URL` to receive an already-running copy, or `OPEN_TABLE_RECEIVING_DIR` to retain a separate run. The scripts do not inspect signed-in browser profiles.

The focused workshop course uses ordinary mouse and keyboard play to check match and proposal continuity, private handoffs, and checked-game activation after a cross-game pack import. Run it as a non-root user with `npm run receive:workshop`; it starts its own loopback server. To receive a standalone downloaded build, use `node scripts/workshop-receive.mjs --file /absolute/path/open-table-0.4.1.html --output /absolute/path/fresh-receiving-directory`. File receiving disables networking before navigation and verifies the HTML remains unchanged. `--url http://127.0.0.1:PORT/` receives an existing local server without stopping it. Each run needs a fresh output directory and records the observed browser, checks, screenshots, errors, requests, and cleanup.

The initial runtime snapshot `af04f2b1213784b48422cb9fcd8f26aa86dcdbff` passed 42 native/HTTP tests and 15 actual-browser scenarios on Node 22.23.4 / Chrome 156.0.8078.47. Browser evidence covers complete game outcomes, scan/confirm behavior, private handoffs and a repeated-key regression, indistinguishable private states, actual downloads/file-input reopening, rejected imports, proposal boundaries, designer separation, and 1440/390/320-pixel layouts. Desktop and narrow screenshots were visually reviewed.

[PR #1](https://github.com/Jacob-Met/open-table/pull/1) merged the hidden-dependent choice-meaning correction at commit `ec2a618ad2e3a83a69c2777dfff2af4df61cde82`, with tree `1c190a5821fa5f8bcf8cea6364af588461149a9b`. Its recorded qualification covers 48 native/HTTP checks and 15 actual Chrome scenarios for that exact tree. See [the correction evidence and scope](docs/RECEIVING.md#merged-choice-meaning-correction); this documentation update records existing execution.

For the optional Node.js version, download `open-table-0.4.1.tgz` from the [private 0.4.1 release](https://github.com/Jacob-Met/open-table/releases/tag/v0.4.1), extract it, and run `npm start` from its `package` directory with Node.js 22 or later. The [integrated 0.2.0 package](release-artifacts/open-table-0.2.0-integrated-bb3d8e.tgz) remains a historical snapshot. See [continuous-scan integration and receiving scope](docs/CONTINUOUS_INTEGRATION.md) for the preserved corrections, qualification boundaries, and remaining project requirements.

See [receiving evidence](docs/RECEIVING.md), [research and model-route limits](docs/RESEARCH.md), and [recovery state](docs/RECOVERY.json). The separate initial clean archive also passed all 42 native/HTTP and 15 browser scenarios through its own npm start. Its private remote source/tree identity was verified. The [qualified initial private archive](release-artifacts/open-table-0.1.0-af04f2b.tgz) is retained as a historical snapshot; it does not contain the merged correction.

The [private submission draft](docs/SUBMISSION_DRAFT.md) separates proposed entry text from its evidence and unresolved project requirements.

## Ownership

Private estate source. All game rules, UI, synthetic fixtures, and visual artwork here are original authored material. No third-party game art, commercial rulebook, audio sample, or model weights are bundled. No public license or release is granted by this prototype.
