// Public labels use Players 1/2; the engine indexes those same seats 0/1.
export const GAME_IDS=Object.freeze(['beacon-steps','pocket-signals']);
const DEFINITIONS={
  "beacon-steps": {
    "gameId": "beacon-steps",
    "title": "Beacon Steps",
    "rules": [
      {
        "ref": "beacon.rule.start",
        "text": "Begin at position 0. Player 1 takes the first turn; players then alternate."
      },
      {
        "ref": "beacon.rule.move",
        "text": "On a turn, advance exactly 1 or 2 positions. A move past position 7 is illegal."
      },
      {
        "ref": "beacon.rule.win",
        "text": "The player whose move reaches position 7 exactly wins. The game ends immediately."
      },
      {
        "ref": "beacon.rule.public",
        "text": "Position, target, turn, legal public moves, and the outcome are public. There is no hidden game information."
      }
    ],
    "components": [
      {
        "ref": "public.position",
        "label": "Current position",
        "description": "The shared position from 0 to 7, with its number and a redundant named shape or marker."
      },
      {
        "ref": "public.target",
        "label": "Target",
        "description": "The fixed public target, position 7, expressed as text as well as a marker."
      },
      {
        "ref": "public.turn",
        "label": "Turn",
        "description": "The player allowed to act, using a player name or number in addition to a visual indicator."
      },
      {
        "ref": "public.outcome",
        "label": "Outcome",
        "description": "The winning player when the target is reached; no additional moves after the terminal outcome."
      },
      {
        "ref": "actions.advance",
        "label": "Advance controls",
        "description": "Only the engine-approved advance-by-1 or advance-by-2 actions. Selection is separate from explicit commitment."
      }
    ],
    "adapters": {
      "shape-text": [
        "public.position",
        "public.target",
        "public.turn",
        "public.outcome",
        "actions.advance"
      ],
      "switch-select": [
        "actions.advance"
      ]
    },
    "fixtures": [
      {
        "ref": "ot-fixture-001",
        "description": "Synthetic Beacon state near the target, for checking the remaining legal action set."
      },
      {
        "ref": "ot-fixture-002",
        "description": "Synthetic Beacon terminal state, for checking the exact winning outcome."
      }
    ]
  },
  "pocket-signals": {
    "gameId": "pocket-signals",
    "title": "Pocket Signals",
    "rules": [
      {
        "ref": "pocket.rule.deal",
        "text": "Use the five distinct cards numbered 1 through 5. Each player receives an unordered hand of two distinct cards, without replacement across both hands; one card is undealt. There are 30 valid assignments of hands to the two players."
      },
      {
        "ref": "pocket.rule.order",
        "text": "Play exactly two rounds. Player 1 commits first in each round, followed by Player 2."
      },
      {
        "ref": "pocket.rule.commit",
        "text": "A player privately commits one available card from their own hand. A player cannot select an opponent card or a card already spent."
      },
      {
        "ref": "pocket.rule.reveal",
        "text": "Player 2 committing completes the round and reveals both committed cards together. Both cards are spent, the pending commitments are cleared, and the next round, if any, starts with Player 1."
      },
      {
        "ref": "pocket.rule.points",
        "text": "In each round the higher card earns exactly one point. No round tie is possible because the four dealt cards are distinct."
      },
      {
        "ref": "pocket.rule.finish",
        "text": "After the second reveal, the player with more points wins. A final score of 1–1 is a draw."
      },
      {
        "ref": "pocket.rule.private",
        "text": "Round, turn, scores, paired revealed history, and the outcome are public. A player may see only their own remaining hand and own pending card. The opponent hand and an unrevealed opponent commitment remain hidden."
      }
    ],
    "components": [
      {
        "ref": "public.round",
        "label": "Round",
        "description": "The shared round or completion status, expressed in words and numbers."
      },
      {
        "ref": "public.turn",
        "label": "Turn",
        "description": "Which player may commit next, without disclosing that player’s selected or available card values."
      },
      {
        "ref": "public.scores",
        "label": "Scores",
        "description": "The publicly earned points for both players, with equal one-point stakes in each round."
      },
      {
        "ref": "public.history",
        "label": "Revealed rounds",
        "description": "Only completed pairs of revealed cards and their round result. Never a still-pending opponent card."
      },
      {
        "ref": "public.outcome",
        "label": "Outcome",
        "description": "The final winning player or draw after two completed rounds."
      },
      {
        "ref": "private.own-hand",
        "label": "Your hand",
        "description": "The locally bound viewer’s own remaining cards only, with readable card values and redundant shapes. This component cannot choose a different viewer."
      },
      {
        "ref": "private.own-pending",
        "label": "Your pending card",
        "description": "Only the bound viewer’s own committed card while the round is pending. No private values enter shared announcements."
      },
      {
        "ref": "actions.commit",
        "label": "Commit controls",
        "description": "Only the acting player’s engine-approved card choices, presented in their private view. Selection alone does not commit or reveal a card."
      }
    ],
    "adapters": {
      "shape-text": [
        "public.round",
        "public.turn",
        "public.scores",
        "public.history",
        "public.outcome",
        "private.own-hand",
        "private.own-pending",
        "actions.commit"
      ],
      "switch-select": [
        "actions.commit"
      ]
    },
    "fixtures": [
      {
        "ref": "ot-fixture-003",
        "description": "Two synthetic pending-commit worlds for checking the waiting observer’s information partition. Private fixture details remain in the designer inspector."
      },
      {
        "ref": "ot-fixture-004",
        "description": "A synthetic completed two-round draw, for checking the equal-stakes terminal outcome."
      }
    ]
  }
};
export function catalogDefinition(gameId){if(typeof gameId!=='string'||!Object.prototype.hasOwnProperty.call(DEFINITIONS,gameId))throw new Error('Unknown OPEN TABLE game.');return structuredClone(DEFINITIONS[gameId]);}
export function canonicalJSON(value){function ordered(item){if(Array.isArray(item))return item.map(ordered);if(item&&typeof item==='object')return Object.fromEntries(Object.keys(item).sort().map(key=>[key,ordered(item[key])]));return item;}return JSON.stringify(ordered(value));}
