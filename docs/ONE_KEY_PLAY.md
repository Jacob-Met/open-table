# One-key play: interaction and receiving scope

## Play a complete session

Run `npm start` with Node.js 22 or later, then open the printed loopback address with `#one-key` appended. The ordinary **Play with one key** button is another entry point and is reachable with Tab. Reaching the page or entry button is a separate setup step; the complete session claim begins after entry.

The focus moves among explicit, visible, enabled native buttons. Choose a game, play every turn, reveal your own hand when appropriate, replay, and return to the game menu with Space or Enter. Space activates on release. Enter activates on press. Release the key before making the next choice. Key repeat cannot cross a game or private-hand transition.

The focus ring uses an outline and a contrasting outer band; it does not rely on color alone. Scanning never activates a control. The default interval is 1.4 seconds. **Pace** cycles to 2.4 seconds, 4 seconds, and back to 1.4 seconds. Changing pace retains focus on that button and starts a full new interval.

**Pause** covers any private hand and pins focus on **Resume**. Resume starts with the appropriate first control and a full interval. Pocket Signals still requires a fresh press on **Show my hand**. To reach Pace or Exit using the same key, resume first and wait for that control; private cards stay covered. **Cover my hand** returns to that same private gate. **Choose a game** covers the hand and returns to game selection. Choosing a game starts a fresh game. **Exit** covers the hand, restores the previous presentation, removes the mode fragment, and focuses the game heading. Automatic Scan + select remains paused on return.

**Save / resume match** opens a covered menu for the explicit browser snapshot. **Back to play** starts focused. Save, Replace, Resume and Forget each require a confirmation; Cancel starts focused and the confirmation has only two scan targets. A resumed private match returns to a fresh handoff. See [saved matches](SAVED_MATCHES.md) for browser storage and privacy limits.

One-key play uses existing Shapes + words legal actions. No game rules, finite checker, hidden-state model, or authored outcomes are changed. The older Scan + select interface remains available in ordinary play; the two automatic scanners do not run together.

## What the receiving course establishes

`npm run receive:one-key` starts an owned loopback server and a fresh Chrome profile through the maintained browser driver. It also accepts `OPEN_TABLE_RECEIVING_URL` for an already running build and `OPEN_TABLE_ONE_KEY_DIR` for a fresh evidence directory. The driver blocks non-loopback page requests and does not inspect signed-in profiles.

The course uses actual native keyboard events and waits for actual focus during gameplay. It does not click controls through script, directly focus gameplay buttons, manipulate the timer, invoke game transitions, or inspect engine state. A separate disposal fixture intentionally replaces the mounted app with a test button to establish that the old listeners and timers have been removed.

Required checks are:

1. Complete Beacon Steps with Space, replay, and return to the menu.
2. Complete Pocket Signals with Space, replay, and return to the menu.
3. Repeat both complete sessions with Enter.
4. Reach the ordinary entry by Tab and hold Enter through setup without choosing a game.
5. Hold Space across multiple intervals and repeat events; release commits exactly one step.
6. Hold Enter while choosing a game without accidentally making its first move.
7. Hold and repeat Enter during a private commitment without uncovering the next hand.
8. Hold a second activation key across a private transition without dismissing the handoff.
9. Cover, pause, resume to Pace at the fastest interval, and return to the game menu without retaining or automatically revealing a private hand.
10. Change each pace while preserving the hand and measuring the full new interval.
11. Exit during a private hand, and pause then resume to Exit without revealing again; return to a non-action heading.
12. Move focus to a real second browser target while holding Space; return without a stale activation and make a fresh move.
13. Observe every visible unpaused button enter the focus cycle at setup, public play, private handoff, and revealed private play without any automatic action.
14. Destroy the mounted application and verify normal native repeat behavior on an isolated replacement button.
15. Capture actual desktop and 320-pixel runtime views and check horizontal fit.

The two keys and two games produce four separate completion cases, so the required machine-readable total is 16. A partial run cannot report success. Receipts bind both the renderer and new controller to their local source bytes, served bytes, and generated source digests. The full package course also runs the retained native, browser, focus, import, continuous-scan, boundary, and Space-confirmation courses against an extracted archive through its own `npm start`.

The release evidence records the exact integrated source version, archive hash, runtime versions, actual test outcomes, downloaded-build receiving, and visual review. A local syntax check or a source file present in a checkout is insufficient to establish a delivered playable build.

## Compact layout and receiving

One-key play places the board, legal choices and session controls in one table column. The rules remain below the table. The ordinary interface keeps its original/adapted choice comparison. Primary game text and card sizes remain unchanged. Utility buttons use 14px labels, flexible wrapping and a minimum 44px target height.

At the recorded 320 × 844 viewport, the layout course requires all eight revealed Pocket Signals targets to remain visible throughout a complete focus cycle, including the wrap back to the first choice, with no scan-induced vertical movement. That requirement is bounded to the tested viewport and rendered state. Enlarged content and shorter viewports can require vertical scrolling; controls reflow into one column at narrow effective widths.

Run the maintained layout course as a non-root user:

```sh
npm run receive:one-key-layout -- --output /absolute/path/fresh-layout-receiving
```

The course starts and closes its own loopback server by default. Use `--url http://127.0.0.1:PORT/` to receive an existing local server without stopping it, or `--file /absolute/path/open-table-0.6.0.html` to open the standalone artifact offline. Each run needs a fresh output directory.

The seven required cases cover:

1. Exact source or embedded build-input binding.
2. Setup and private-curtain target visibility at 320 × 844.
3. A complete eight-target revealed-hand cycle, including wraparound, with actual focus, no overlapping targets, no horizontal overflow, no vertical movement, and unchanged deliberately revealed cards and legal choices.
4. Pause covering the hand, focus remaining on Resume, and a fresh private gate after resuming.
5. Beacon Steps completion, terminal actions and replay.
6. Desktop layout and return to the ordinary hero, choice comparison and rules.
7. An explicit `document.documentElement.style.zoom = '2'` reflow stress fixture: vertical scrolling is allowed, each focused control must remain reachable, button text must fit, and horizontal overflow is rejected.

The driver sends native keyboard events and observes the player-facing DOM. The course never directly focuses gameplay buttons, changes timers, invokes transitions or inspects hidden game state. It records usable viewport dimensions, target rectangles, actual focus and scroll movement; verifies sandboxed non-root execution; and checks browser errors, requests, artifact bytes and owned-process cleanup. Screenshots require visual review alongside the machine checks. The 2× CSS-zoom fixture is not native browser zoom, operating-system magnification, a physical-switch test or a human accessibility evaluation.

The full extracted-package gate includes this seven-case course and the five-case workshop preservation course alongside the retained behavioral receivers. Release qualification must bind their actual results to the exact source and downloaded artifact; adding the receivers does not itself establish a passing release.

## Limits

This is cooperative local pass-and-play on a trusted device. Players pass the device and look away during another player's private turn. The interaction gates prevent accidental repeat activation; they do not secure information from someone watching the screen or inspecting application memory.

The session path excludes workshop authoring, saving/opening packs, and operating-system file dialogs. The course exercises a keyboard in the recorded Chrome/Linux runtime. It does not establish compatibility with physical switches, switch-mapping software, screen readers, other browsers or platforms, nor universal accessibility or human usability. Human access playtesting remains a separate project dependency.

No model inference, public distribution, deployment, new license, credentials, spending, or competition submission is part of this increment. Historical receiving documents retain their original scope.
