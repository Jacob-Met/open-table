# Play Open Table offline

Download the standalone `open-table-0.7.0.html` file from the private release and open it in your browser. No Node.js, local server, account, or network connection is required to play.

Choose a game and play with its existing controls. **Play with one key** starts the focus-scanning session. Opening the same file with `#one-key` appended to its address enters that mode directly. Space and Enter have the same behavior as in the regular application.

Opening or reloading starts a fresh live session. **Keep this match** lets you explicitly save one snapshot and **Resume** it after returning to the same file in the same browser profile. Play does not autosave. Snapshots include private cards; anyone using that browser profile can resume them. Local-file storage can vary between browsers and file locations. See [saved matches and their limits](SAVED_MATCHES.md).

## Packs and private hands

**Save pack** downloads a separate JSON file containing the game, adaptation, classification, schema and current rule pin. It contains no private hand or play history. **Open pack** lets you choose a saved pack and checks it against the current rules before activation. File contents stay in the local application.

Pocket Signals retains the shared-device handoff: cover a hand, pass the device, then let the next player reveal their own cards. The file uses the existing trusted-device pass-and-play model. It does not create separate player accounts or encrypted multiplayer state.

The offline Workshop also prepares and downloads an access-need request from the current authored catalog. This is local preparation and performs no model invocation. See [authoring requests](AUTHORING_REQUESTS.md).

## Receiving scope

The offline receiving course opens the actual HTML through a file URL in a fresh Chrome profile, with network connectivity disabled before navigation. Each receiving directory contains only the HTML; source modules and styles are absent. It records page requests, frames and attempted WebSockets, rejects other file or network dependencies, and checks real rendered controls.

The ordinary course checks both games, private handoffs, actual pack-download bytes, a real browser file-input reopen, invalid-pack rejection, workshop checks, reload, a renamed filename containing spaces and Unicode, and narrow layout. File input is exercised through the browser automation interface; native operating-system picker interaction is not claimed.

The one-key file course runs 15 behavioral cases covering both complete games with Space and Enter, held/repeated keys, mixed activation keys, privacy, pause, pace, exit, real window blur, focus coverage and viewport layout. The separate disposal fixture imports the maintained module and stays in the 16-case HTTP course; the production standalone file exposes no fixture mount API.

The separate seven-case one-key layout course checks compact focus geometry, terminal/replay, ordinary-layout restoration and an explicitly labeled 2× CSS-zoom stress fixture. The five-case workshop course checks match and proposal preservation, deliberate private handoffs and checked-game activation after cross-game pack import. These are separate receiving courses; their results must be recorded for the actual downloaded file.

Qualification is bounded to the browser, operating system, source hashes and results recorded in the accompanying receipt. Other browser and operating-system combinations, physical switches and human usability remain outside that evidence.

The saved-match courses separately verify explicit save/reload/resume, covered private handoffs, terminal snapshots, retained invalid saves, storage failures and fresh one-key presses. They run against the actual standalone file with networking disabled. See [saved-match receiving](SAVED_MATCHES.md#receiving-checks).

## Build the file

These steps are for maintainers. Players open the downloaded HTML directly.

```sh
npm ci --include=dev --ignore-scripts
npm run build:offline -- --out-dir dist/offline
```

The build uses esbuild 0.28.2, pinned by `npm-shrinkwrap.json`. Installation includes development dependencies and the platform-specific optional binary. The browser opening the HTML does not need these tools. esbuild's MIT license applies to the build tool; this does not change Open Table's private-source rights.

The output directory receives the playable HTML and `manifest.json`. The manifest records exact input hashes, the build configuration, and the output's size and SHA-256 hash. The builder validates the maintained source pins before and after bundling and refuses existing output files. Choose a fresh output directory for a second build.

The executable bundle is built from the maintained browser entry, with its stylesheet embedded. No second implementation of the game is maintained. Source commit and tree identity are bound by the external release record; the embedded manifest makes no guessed Git identity claim.

Two clean output directories can be compared to establish reproducibility for the tested inputs and toolchain. This does not imply identical results across every operating system or toolchain.

## Run receiving

From an extracted package or checkout containing the matching sources:

```sh
OPEN_TABLE_RECEIVING_FILE="$PWD/dist/offline/open-table-0.7.0.html" \
OPEN_TABLE_OFFLINE_MANIFEST="$PWD/dist/offline/manifest.json" \
OPEN_TABLE_OFFLINE_DIR="$PWD/receiving/offline" npm run receive:offline

OPEN_TABLE_RECEIVING_FILE="$PWD/dist/offline/open-table-0.7.0.html" \
OPEN_TABLE_OFFLINE_MANIFEST="$PWD/dist/offline/manifest.json" \
OPEN_TABLE_ONE_KEY_DIR="$PWD/receiving/one-key-file" npm run receive:one-key

npm run receive:one-key-layout -- \
  --file "$PWD/dist/offline/open-table-0.7.0.html" \
  --output "$PWD/receiving/one-key-layout-file"

npm run receive:workshop -- \
  --file "$PWD/dist/offline/open-table-0.7.0.html" \
  --output "$PWD/receiving/workshop-file"
```

Receiving requires Node 22 and the maintained Chrome driver environment. Those are verification tools, not requirements for playing the downloaded file. Each invocation needs a fresh receiving directory.

The file carries the result of build-time source verification. The regular `npm start` path remains available and retains its startup source-pin checks. Editing a generated HTML file changes its hash; rebuild and receive the maintained source to qualify another artifact.
