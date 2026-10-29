# Scanning while the table is hidden

## Behavior

In Scan + select, leaving the browser tab suspends automatic scanning. The selected choice and game state stay in place. Returning to a visible table starts a full interval at the selected speed before the next choice. A deliberate pause remains paused.

Hiding the page also cancels a held Space confirmation. Returning does not confirm a choice, reveal a private hand, or restore controls from an earlier screen. The private handoff curtain, Workshop, One-key play and app disposal retire the ordinary scanner. A new rendered scanner owns its own timer and visibility callback.

Moving focus within a visible page still cancels a pending Space press without turning off the player's automatic-scanning preference. Visibility suspension applies to the ordinary Scan + select controller; One-key play retains its own focus and lifecycle handling.

## Receiving

The focused browser course uses an owned blank Chrome tab to produce actual `document.hidden` changes. It records the served renderer hash, choice samples, game observations and browser errors. Its source and standalone-file modes exercise the same UI scenarios:

- active scanning remains stable while hidden and resumes after a fresh dwell;
- a deliberate pause persists across hiding and returning;
- private handoff stays covered;
- hiding cancels a held Space press, while a fresh press can still confirm;
- Workshop and One-key play do not revive an ordinary scanner.

A separate source fixture exercises programmatic hidden-page rerender, speed changes and mount disposal. These lifecycle controls are explicitly fixtures, not claims about a person manipulating an invisible tab.

```sh
npm test
npm run receive:space
npm run receive:visibility
npm run receive:visibility-lifecycle
python3 scripts/receive-package.py
```

The package course runs through the extracted archive's actual `npm start` entrypoint, then builds and checks the standalone HTML. Fresh receiving directories retain failures as well as successful receipts.

The Chrome driver disables background timer throttling and renderer backgrounding so that application suspension is tested directly. These results do not establish battery savings, operating-system input routing, usability with physical switches, or accessibility with people and assistive technology.

## Baseline and ownership

The defect was reproduced on main commit `e0719205c72f6f96b85d3483464fb302e7f4f9c1`: the selected choice advanced twice during seven hidden-page samples spanning about 3.15 seconds at the 1.4-second speed. The marker stayed unchanged. That observation is retained separately from correction receipts.

This is complementary receiving and correction for [issue 7](https://github.com/Jacob-Met/open-table/issues/7), recorded under native task `open-table-visibility-receiving-823030c1`. It preserves the original visibility claimant, the existing product, scanner, private-release and pack-import owners, and the separate draft-only hold on PR 15. Source, package and offline results remain attributable to their exact tested snapshot.
