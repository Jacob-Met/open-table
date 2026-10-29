# Space confirmation

## Behavior

In Scan + select, Space follows the browser's native button behavior: pressing it begins a confirmation and releasing it activates the button once. Automatic scanning keeps the choice fixed while Space is held on Confirm. Repeated keydown events neither change that choice nor make a move. Enter still confirms immediately. Moving focus away cancels the press; automatic scanning can continue. A manual pause remains paused.

The hold belongs to the current app mount. Button blur, window blur, release, confirmation, render and disposal clear it. The timer remains on its existing cadence while held; no extra timer or timeout is introduced. Private handoff continues to remove both private choice panels and waits for a fresh Show my hand activation.

## Reproduced defect

The integrated 0.2.0 runtime at source commit `23586676db4bc2ae4bfb655b73320016e80faa05` (renderer SHA-256 `e6147ed9dac55ac2ea382b0bcc88d4db45024f715bfbf7410861f00ba0956d4d`) advanced the scan during a held Space press. Actual Chrome receiving showed a press beginning on Advance 1 but committing Advance 2 on release. The same happened with repeated keydowns. An authored Pocket Signals fixture began on Commit 2 but its public round history later showed Player 1 played 4. This is an input-selection correction; the game rules, adapter meanings and private observation boundaries are unchanged.

## Maintained receiving

```sh
npm test
npm run receive:space
python3 scripts/receive-package.py
```

The focused course uses the owned Chrome driver and real keydown/keyup events. It samples a hold across multiple scan ticks, repeated keydowns, private commitment and curtain behavior, Tab cancellation, a prevented native keyup, manual pause, reset during a hold, mixed Enter/Space input and actual focus loss to an owned blank browser tab. It checks the served renderer against the extracted source hash and records a 320-pixel guidance screenshot. The package receiver runs it alongside the existing native, browser, focus, pack-import, continuous and boundary courses through the extracted archive's actual `npm start` entrypoint. Existing source-pin gates remain active.

These deterministic browser checks do not establish usability with physical switches, screen readers, or people. Existing human playtesting and bounded model-experiment dependencies remain. The private 0.2.0 archives and their historical receiving documents remain attributable to their original snapshots.

## Ownership and receiving trail

Native coordination task: `open-table-space-confirmation-65313a32`. This correction preserves the product, scan integration/recovery, pack-import lifecycle and private demonstration owners. The private release records its source commit, archive SHA-256 and completed receiving evidence. No public release or license is granted.
