# OPEN TABLE 0.5.1-visibility.1 — private experimental preview

This prerelease improves ordinary **Scan + select** when you switch browser tabs during local pass-and-play. The scanner keeps your selected choice while the game is hidden. Returning gives that choice a fresh dwell before scanning continues. A deliberate pause stays paused. Leaving the tab while holding Space cancels that pending confirmation; press Space again after returning when you want to confirm a choice.

This is a private experimental preview of version 0.5.1. The main release remains 0.5.1. Use the assets attached to this prerelease together; other release work remains separate.

## Launch

**Standalone browser version:** download `open-table-0.5.1-visibility.1.html`, then double-click it to open it in your browser. Keep the downloaded file available for future local sessions.

**Node version:** install Node.js 22 or newer, download `open-table-0.5.1-visibility.1.tgz`, and extract it into a new directory. From the extracted `package` directory, run `npm start`, then open the local address printed by the server. For example:

```sh
mkdir open-table-visibility-preview
tar -xzf open-table-0.5.1-visibility.1.tgz -C open-table-visibility-preview
cd open-table-visibility-preview/package
npm start
```

The release manifest identifies the source and included assets. Use the accompanying checksums to verify your downloads before opening or extracting them.

## Existing access packs

Source-bound packs exported from another build may be rejected by this preview. If a pack reports a source mismatch, open the preview, review the settings you want, and export a fresh pack from this build. Keep your original pack for its original build. A fresh export does not establish compatibility with every other version.

## Supported paths and verification

The received runtime has been exercised on Linux x86_64 with Chrome 156.0.8078.47 and Node.js 22.23.4 / npm 10.9.9. Other operating systems and browser combinations are not qualified by this preview.

The release's qualification record identifies the exact source, package and standalone-file checks, actual downloaded-build results, and asset checksums. The preview derives from integrated core source `d5fcb837fd30f908f957e648c2737cab55b89020`; the preview's own exact source is the GitHub tag target recorded with the release.

Real browser tab changes cover selection retention, a fresh visible dwell, deliberate pause, Space cancellation and fresh confirmation. Source-only lifecycle fixtures separately exercise hidden speed changes, replacement of the mounted game, retirement of old controls, and disposal followed by a fresh mount.

This is a separate experimental download, not an automatic update to stable 0.5.1. It is intended for private local pass-and-play. Deterministic browser and lifecycle checks do not establish physical-switch compatibility or universal accessibility with people and assistive technology.
