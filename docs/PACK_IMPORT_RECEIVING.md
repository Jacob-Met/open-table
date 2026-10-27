# Pack import lifecycle receiving

A slow adaptation-pack read must not replace a later file selection, game or pack choice, accepted turn, privacy action, or mounted application. The same rule applies to a late read error. A retired app's destroy handle must also leave a newer app intact.

## Behavior

Each nonempty file selection owns a mount-local generation before size and content validation. Successful reads and read failures may affect the UI only while that generation and mount remain current. Accepted game and privacy transitions retire older reads. The accepted import keeps its own generation while it applies, so a current validation or application error remains reportable.

Saving a pack, incidental rendering, and an empty file-change event preserve a current pending read. Disposal retires the generation and stops scanning; only the instance that still owns the root can clear it.

The current main Open button only opens its chooser. The original owner's newer continuous-scan implementation also covers the hand and stops scanning before opening the chooser. That existing cover action retires a pending read even when no new file is selected. The compatibility check preserves this distinction.

## Reproduce

Use Node 22 or newer and the Chrome route already supported by the repository's browser driver:

```sh
npm test
node scripts/browser-receive.mjs
node scripts/pack-import-browser.mjs
```

The focused receiver writes `artifacts/pack-import-browser/pack-import-receipt.json` by default, plus play/workshop screenshots and screenshots for failed cases. Set `OPEN_TABLE_RECEIVING_DIR` to a fresh output directory. Set `OPEN_TABLE_RECEIVING_URL` to receive an already running loopback application. Run the receiver shipped inside an extracted package against that package's `npm start` URL for package qualification.

The receiver uses the actual file input, original file bytes, real controls, and the existing authored mount-fixture API. It defers or rejects `File.prototype.text` to expose ordering deterministically. The no-file control uses standard input clearing and an explicitly dispatched change event; it does not claim native picker cancellation.

## Observed results

The machine-readable record is [pack-import-receiving.json](evidence/pack-import-receiving.json).

| Receiving surface | Result |
| --- | --- |
| Original main `ec2a618`, corrected focused receiver | 12 regressions fail; all 4 controls pass |
| Corrected source, native suite | 48/48 pass |
| Corrected source, existing browser course | 15/15 pass |
| Corrected source, focused import course | 16/16 pass |
| Fresh private package launched through `npm start` | Existing 15/15 and focused 16/16 pass |
| Isolated owner `0043e7d` composition | Native suite, existing 15, focused 16, composition 4, and owner's continuous-scan 5 all pass |

The four controls cover valid import, current malformed import, saving during a pending read, and a no-file change. Regressions cover ordered selections, rejection of the latest selection, explicit game/pack/turn/reveal changes, stale errors, private handoff, detached retired nodes, and an obsolete destroy handle.

Actual desktop and narrow-layout screenshots were inspected. The board, actions, and access-pack controls remain readable; this change alters no styles or assets. Browser runs reported no runtime errors.

## Source and ownership

The qualified application bytes have SHA-256 `cdb6a4db2f0b254c440ce46d9f71fd80141657c11d64ea22aefa7d10b03fffcd`. The maintained integration base is `316050a6f194d2eb64b0a5606f050637378fbdd0`. Complete tree comparison against the qualification base found only the already merged README, receiving guide, and submission-draft changes. Those files are preserved exactly.

The private runtime qualification archive has SHA-256 `b8d888d6ed6f7a0caacfe93feea41264b560dba100e31e55abee7c466ad56f3f`. It contains the qualified runtime and focused receiver from the earlier qualification base; it is not presented as a final merged delivery archive. Its launch verified matching application, rule pins, server, assets, and browser scripts in the extracted package.

Original runtime/model/continuous-scan ownership remains with `hamon-76408-20261027`. Submission-copy ownership remains with `estate-h6e8-20261027`. The isolated compatibility work did not edit their checkout or adopt their unmerged work. Its base lacks maintained PR1, so those checks establish compatibility of the import guard with the owner's behavior, separately from maintained integration.

The original package operation was recovered with its unchanged owner, incarnation, generation, operation ID, native command ID, and arguments. Its terminal exit 1 followed successful archive creation and a receiving-wrapper JSON parsing failure. A distinct continuation command verified and reused that archive, extracted it, launched `npm start`, completed both browser suites, and stopped its server. It did not run `npm pack` again. Separate unresolved read-only diagnostic and worker-read handles remain recorded; no package effect remains outstanding.

The four-case composition receiver used accepted CDP file-chooser interception and verified the actual Open button, cover/rerender, and connected replacement-input activation. It did not independently observe the `fileChooserOpened` event or native operating-system picker cancellation.

Task: `open-table-pack-import-intent-90d252`; retained team: `estate-90d252-20261027`, `implementation_review`, `product_verification`, and `recovery_review`. This qualification establishes tested software behavior. It adds no human playtest, universal accessibility, model-inference, public-release, or competition-submission claim.
