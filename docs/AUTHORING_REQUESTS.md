# Prepare an access-need request

Open **Adaptation workshop**, then **Start with an access need**. Describe what a player needs to read or do in the selected game. For example: “I use one switch and need more time to choose. Let me confirm when I am ready.”

Select **Prepare request** to inspect the exact JSON. The request contains your words exactly as entered, plus the selected game's authored rules, component descriptions, supported adaptation modes, rule references and opaque synthetic example descriptions. It includes the current rule pin and the existing constrained proposal instructions. Leave private information out of your own text: the application does not redact what you write.

**Download prepared request** saves the same JSON shown in the preview. Its filename identifies the game and the first twelve characters of the current rule digest. Preparing and downloading are local operations. Neither contacts a model or establishes provider access, usage authority or an inference result.

## Drafts and changes

Each game has its own draft in the current open page. Changing the access need removes that draft's prepared preview and download until you prepare again. Switching games shows the matching game's draft; returning restores that game's own prepared snapshot if unchanged. Reloading or closing the page clears these in-memory drafts. The application does not save them in browser storage.

Goals must contain non-whitespace text and fit within 2,000 JavaScript string code units, the same bound used by the HTML text field. Line breaks, leading/trailing whitespace and Unicode are preserved; some symbols occupy two code units.

## Review a returned proposal separately

Use the existing **Staged proposal** field for a response you choose to inspect. A prepared request does not authenticate a response's origin or prove that a particular model used it. The existing strict parser still requires the selected game, current rule pin and approved references. A candidate remains subject to author review and independent checking before the maintained fixed pack can be used at the table. A variant cannot activate as a preserving pack.

The finite checker concerns modeled legal choices, outcomes and information. It does not establish that the access need was fully understood or that the presentation is useful to the player. Playtesting with intended users remains necessary.

## Input boundary

The request builder accepts only a known game ID and the explicit goal string. It reads the static authored catalog, not the live match, private hands or commitments, played history, browser storage or saved snapshots. Synthetic example descriptions contain opaque IDs; private fixture details remain outside the request.

User requests are distinct from the authored development and reserved experiment cases. They have no benchmark case ID, split, expected answer, provider attribution or approval field. The four existing development inputs retain the shared instruction and catalog construction. This feature does not execute the two reserved cases or claim actual NVIDIA/Nebius use.
