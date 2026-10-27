# OPEN TABLE — submission content draft

**Prepared for existing product owner `hamon-76408-20261027`. This private draft has not been posted or submitted.**

Part A contains proposed entrant-facing copy. Part B contains private review notes and evidence boundaries; keep it separate from a public entry.

## Part A — proposed entrant-facing copy

### Project name

OPEN TABLE

### Short description

Play tabletop adaptations and inspect the choices and information they preserve.

### Inspiration

Changing how a player reads or selects a move can also change the game. A clearer label might reveal a hidden card. A simpler control might remove a legal option. Even a button that looks unchanged can secretly change meaning.

OPEN TABLE gives designers and mixed-access playgroups a playable way to examine those risks: try an original game, select a different presentation, and inspect what the adaptation preserves.

### What it does

The prototype includes two original games. In **Beacon Steps**, players alternate moving a shared marker by one or two spaces. Exact arrival at seven wins; overshooting is illegal. In **Pocket Signals**, each player receives two different cards from values 1–5, without replacement. Players commit privately, reveal together, and award one point to the higher card. They repeat with their remaining cards; a one–one score is a draw.

Players choose **Shapes + words**, with numbered and named-shape controls, or **Scan + select**, with manual cycling or timed scanning followed by explicit confirmation. Scanning alone never makes a move. Original and adapted choices appear for the same acting player.

Pocket Signals clears private cards and choice panels before handoff. A held Enter key cannot automatically reveal the next player's private turn; a fresh press works.

The workshop exposes deliberately bad adaptations. Removing a legal choice produces an action mismatch. Revealing an opponent's hand produces two synthetic situations that the original player could not distinguish. These examples stay separate from live play and cannot activate as access packs.

**Save pack** downloads a permitted adaptation selection bound to its source. It contains no private hand, pending move, history, or saved proof. **Open pack** validates the selection and checks it again before activation.

### How we built it

OPEN TABLE uses Node.js and browser JavaScript, with no third-party runtime dependencies or external application requests. Executable rules describe each game's bounded state space. An independent checker compares legal choices, transitions, outcomes, and what each player can distinguish.

A central challenge was preserving the meaning of a visible choice. An earlier checker accepted adaptations whose identical buttons decoded differently according to an opponent's hidden hand or pending move. Paired play produced a loss in one situation and a win in another. The corrected checker rejects those cases and retains the conflicting actions and replayable synthetic situations.

The workshop also reviews constrained proposals against approved rule phrases and component references. Editing a proposal clears its previous review; an author must explicitly review a supported mode before checking. A proposed variant cannot enter the preserving-pack activation path.

The proposal example is authored test data. **The prototype has not executed NVIDIA or Nebius inference.** Model-assisted rule interpretation and proposal generation remain future work.

### What we have verified

The finite courses cover **14 states and 22 legal transitions** for Beacon Steps, and **450 states and 420 transitions across 30 initial deals** for Pocket Signals. The corrected source tree has recorded qualification of **48 native/HTTP checks and 15 actual Chrome scenarios**.

Browser scenarios cover complete game outcomes, scan/confirm behavior, private handoffs, held-key protection, actual pack downloads and reopening, rejected imports, proposal boundaries, and desktop plus 390- and 320-pixel layouts.

These results apply to two authored games and fixed, deterministic adaptations. Human access playtests, physical-switch evaluation, and whole-application single-switch navigation remain untested. The prototype is local pass-and-play on a trusted device: full game state exists in local memory, accessible to someone controlling that device.

### What is next

The next step is to evaluate the full setup-to-play experience with affected players and designers. The proposed model route would use a suitable NVIDIA model on an authorized Nebius runtime to interpret rules/components and suggest grounded adaptations. Model output would remain a proposal; authored rules, explicit review, and independent execution would determine acceptance.

### Built with — confirmed

Node.js, JavaScript, browser UI, original finite game models, independent adaptation checks, and Chrome receiving.

## Part B — private owner review notes

### Evidence and version basis

The copy is grounded in `README.md`, `docs/RECEIVING.md`, and `AGENTS.md` from main **`ec2a618ad2e3a83a69c2777dfff2af4df61cde82`**, the four project comments below, and merged PR #1. The lead's fresh Renpō branch read records that merge commit, dated 2026-10-27 03:24:32 UTC, with tree **`1c190a5821fa5f8bcf8cea6364af588461149a9b`**. That exactly matches the qualified checker-correction tree. Our team did not perform the merge.

| Evidence | Supported facts and limits |
|---|---|
| [Selected seed 14](https://github.com/Jacob-Met/hamon/issues/1631#issuecomment-6431108006) | Audience, adaptation concept, and proposed NVIDIA/Nebius role. These were proposed applications, not deployed systems. |
| [Primary owner claim](https://github.com/Jacob-Met/hamon/issues/1631#issuecomment-6431153046) | Original-game direction and ownership by `hamon-76408-20261027`; preserve its separate product/model work. |
| [Initial integrated increment](https://github.com/Jacob-Met/hamon/issues/1631#issuecomment-6431631094) | Initial player path, 42 native/HTTP checks, 15 Chrome scenarios, and private archive for runtime `af04f2b…` and initial main `008f74…`. |
| [Qualified correction](https://github.com/Jacob-Met/hamon/issues/1631#issuecomment-6432678511) | Hidden-dependent action-meaning failure and repair; 48 checks and 15 Chrome scenarios for tree `1c190a58…`. Its historical integration-open statement is superseded for main only. |
| [Merged PR #1](https://github.com/Jacob-Met/open-table/pull/1) and [pinned main](https://github.com/Jacob-Met/open-table/commit/ec2a618ad2e3a83a69c2777dfff2af4df61cde82) | Correction adoption, exact source/tree identity, and recorded receiving. The separate continuous-turn counterpart was excluded from this PR. |

The 48-check/15-scenario statement uses the recorded qualification of the exact corrected tree. This content task performed no new product execution. The accompanying documentation clarification preserves the original 42-check receipts and labels their version explicitly.

### Source, media, and package facts

Private source is `Jacob-Met/open-table`. The maintained launch is `npm start` on Node.js 22 or later, serving loopback, normally `http://127.0.0.1:4287/`. That address supplies local testing, not hosted judge access.

The lead inspected the pinned historical `docs/images/desktop-table.png`: 1440×1000 pixels, blob `8179ae3548d944f8f79c48a5d42ec171cb692e38`, PNG SHA-256 `260bef57ce2611d97bbcd1f6942aff1db2258c5632b3d32bf3579b148dbe1f40`. It shows the original/adapted choices, Shapes/Scan access-pack controls, and the game/table hierarchy. This was inspection of an existing image; it supplies neither a fresh runtime course nor approval of submission media. No demo video was captured by this task.

The checked-in archive remains the **initial** `release-artifacts/open-table-0.1.0-af04f2b.tgz`: 450,037 bytes, 36 files, SHA-256 `ba67362d36389ab13bf823a9f64b879e80b9bfd71deaae86213a90da24dbe19c`. Its extraction passed 42 checks and 15 browser scenarios. It predates the merged correction.

The correction record and PR describe a separate 41-file package: 458,452 bytes, SHA-256 `57483832c771568dea09a5722ba6b428c0e2175fd75ef4e2106a006c20af120e`, qualified with 48 checks and 15 browser scenarios. Adoption as the maintained release artifact is not established by the current documentation/archive link.

The owner-stack counterpart `ffac5f7e5ae0a0285d937256543e116ac92dcf88`, based on `a07f1012…`, has separate 48-check, 15-general-browser, and five-focused-course qualification. Its continuous scanning across successive turns and 0.2.0 archive are excluded from current-main claims pending a fresh adoption record.

### Known event and unresolved project fields

Under [current HAMON #1631](https://github.com/Jacob-Met/hamon/issues/1631), preserve Jacob's existing submission-review requirement and action-specific spending, account and security approvals. This draft neither replaces that review nor grants release or submission authority.

The target is the **Nebius x NVIDIA Global AI Hackathon**. Its deadline is **October 30, 2026, 10:00am PDT / 17:00 UTC**. The [official rules](https://nebiusglobalaihackathon.devpost.com/rules) require a working application using an NVIDIA open source model and running through Token Factory inference or Nebius AI Cloud. They also call for a working demo/test-build URL, public source with an open source license and setup instructions, a public YouTube demonstration (under three minutes recommended), a selected track, and tool-use feedback. These are known requirements; this draft does not establish project or entrant eligibility.

| Field | Current project evidence |
|---|---|
| Existing Devpost entry URL | Unverified. Reconcile any existing entry before creating another. |
| Chosen track and entrant eligibility | Unverified; product ownership does not establish a human representative's eligibility. |
| NVIDIA/Nebius execution | No actual inference or platform qualification recorded. The seed suggests Nemotron Nano 12B v2 VL; current endpoint, supported input path, and successful invocation remain unverified. |
| Judge access and video | Local application and historical screenshots exist; a hosted judge link, final test-build delivery, and demonstration video are unverified. |
| Public source and license | Source remains private. Existing project instructions grant no public release or license; this content task changes neither. |
| Entrant names and attribution/disclosures | Unconfirmed. Internal worker identities are not human entrant names. |
| Human accessibility benefit | No affected-user study or physical-switch evaluation recorded. Describe implemented interactions and their limits. |
| Final entry readiness | Unverified. The absence of qualifying runtime evidence remains a concrete dependency. |

Offline development preparation used four authored goals and reserved two mixed-goal cases. Four development proposals selected their required targets; two lacked grounding references (`beacon.rule.win` and `pocket.rule.reveal`). Reserved cases and actual model calls were unrun. This supplies preparation evidence, not a model-quality result.

### Proposed demonstration sequence

This sequence is material for the owner's recording, not an existing video:

1. Open Beacon Steps and show the actor's one-step/two-step options beside the adapted controls.
2. Select timed scanning, let the highlight advance without moving, then confirm a choice.
3. Open Pocket Signals, commit a card, show the cleared handoff, and deliberately reveal the next seat before the shared round reveal.
4. Inspect an omitted-choice or opponent-hand-leak rejection in the workshop and its synthetic witness, separated from live private cards.
5. Save and reopen a safe access pack, showing validation and checking before activation.
6. Close with the bounded result: two authored games, checkable adaptation properties, and model/cloud integration still awaiting qualification.

Use the event's video requirements and avoid exposing private coordination records, account details, or unapproved source. Update the final recording and text only when new implementation and execution evidence supports it.

### Documentation scope

The accompanying README and receiving edits label the initial 42-test archive, record the already-merged correction's 48-check/15-browser qualification, and remove an obsolete future-tense receipt sentence. They preserve the historical package SHA, original failures, and the distinction between merged source and release-artifact adoption.

This candidate changes documentation only. Runtime source, generated pins, tests, package configuration, product ownership, and submission/account state remain outside this content task.
