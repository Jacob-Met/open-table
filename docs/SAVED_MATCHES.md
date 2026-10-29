# Saved matches

Open Table 0.6.0 can keep one match snapshot in your current browser profile. Saving is optional and explicit: play does not autosave. A snapshot records the match when you confirm **Save snapshot** or **Replace snapshot**; later turns do not update it.

## Save, resume, or forget

The **Keep this match** panel contains the saved game name and snapshot time. Each action asks for confirmation, with **Cancel** focused first.

- **Save snapshot** stores the current match when the slot is empty.
- **Replace snapshot** replaces the existing snapshot with the current match after confirmation.
- **Resume** replaces the current match with the saved snapshot. Unsaved turns in the current match are lost. The snapshot remains available.
- **Forget** removes the saved snapshot from this browser. Your current match stays intact.

Cancel makes no storage or rule-state change. The hand stays covered when you return. Starting a new game does not replace the saved snapshot. A finished match can also be saved and resumed with its result and public rounds intact.

In one-key mode, choose **Save / resume match**. **Back to play** starts focused in the menu. During confirmation, scanning visits only Cancel and the action button. Space activates on release; Enter activates on press. Release before making the next choice. Return to play or resume a private match through a fresh handoff.

## Shared-screen privacy

Resuming Pocket Signals returns to a covered handoff for the player whose turn was saved. Private cards and card actions stay absent from the page and accessibility tree until that player deliberately reveals their hand. Pass the device before revealing.

A snapshot includes the private cards needed to restore play. Anyone using the same browser profile, or with access to its stored data or developer tools, may inspect them. This remains trusted-device pass-and-play; the handoff is not authentication or encryption. The saved-match summary and announcements contain no private card values. Adaptation packs still contain no saved match, private hand, or play history.

## Where a snapshot works

Snapshots belong to the browser profile and origin where you saved them. They are not an account backup, cloud sync, or exported adaptation pack. A different browser, profile, hostname, port, or standalone HTML location may have separate storage. Copying a build does not copy browser storage. Local-file storage behavior can vary by browser.

Use the same copy and browser to return. Snapshots are checked against the current build's rule/source pin; compatibility across different or future builds is not promised. An incompatible or corrupt snapshot remains stored until you explicitly replace or forget it. Try the copy that created an incompatible snapshot; recovery is not guaranteed.

Browser settings, private browsing, quotas, or storage failures can prevent reading or saving. Check the panel's result. If saving or forgetting cannot be verified, do not assume it succeeded. Keep the current match available and inspect the slot before relying on it. Clearing browser data may remove snapshots.

The app compares the reviewed slot before changing it and checks the result afterward. These observations are not an atomic lock across tabs. Use one tab for a match; simultaneous changes from other tabs can still race.

## Receiving checks

Run from the source checkout or extracted package, using a fresh output directory:

```sh
node scripts/saved-match-receive.mjs --output receiving/saved-match-source
node scripts/saved-match-boundaries.mjs --output receiving/saved-match-boundaries

node scripts/saved-match-receive.mjs \
  --url http://127.0.0.1:4287/ --output receiving/saved-match-package

node scripts/saved-match-receive.mjs \
  --file /absolute/path/open-table-0.6.0.html --output receiving/saved-match-file
node scripts/saved-match-boundaries.mjs \
  --file /absolute/path/open-table-0.6.0.html --output receiving/saved-boundaries-file
```

The primary receiver uses real game controls to exercise progressed Beacon restoration, Pocket Signals handoff and public-state restoration, cancellation and removal, completed-game restoration, and narrow layout. The boundary course adds denied storage, quota and verification failures, changed-slot refusals, corrupt/incompatible retention, and held/repeated one-key interactions.

Both support a source server, an existing loopback URL, or the actual standalone HTML with networking disabled. Receipts record the observed browser, results, screenshots and errors. Saved private-state bytes are not included in receipts or screenshots.

The package gate runs both courses against the extracted server and the standalone file built from that package, along with the maintained game, import, scan, one-key, workshop and layout courses. Qualification is limited to the actual source/artifact hashes and environment in those receipts. Other browsers, physical switches and human usability need their own receiving evidence.
