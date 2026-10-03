# Bostonian Times — Word Links Daily

A static, vanilla HTML/CSS/JavaScript game. No build step, accounts, or backend.

## Run locally

Keep `index.html`, `styles.css`, `script.js`, `daily.js`, and `words.txt` together.
From this folder run:

```sh
py -m http.server 8002
```

Open http://127.0.0.1:8002/ . On systems using `python3`, substitute that for `py`.
Use HTTP rather than opening the HTML directly, so the bundled dictionary can load.
To run the optional engine tests with an installed Node.js:

```sh
node test-daily.cjs
```

## Daily editions and saves

Archive launch: **September 28, 2026**. The shared puzzle date is calculated in
**America/New_York**, including daylight saving time. An open today's edition
switches to the new puzzle at midnight; an archived edition stays open. Returning
from a background tab checks the date again. The device's clock must be correct.

`daily.js` uses the date and fixed generator version `daily-1` as its seed. Puzzle
generation never depends on dictionary download timing or unseeded randomness.
The version is also part of the localStorage key. Do not change this version's
generator definitions after release: introduce a new version for changed editions.

Each date saves accepted moves, score, completion, direction, selected cell, and
draft separately in localStorage. Moves are legally replayed on load; the score and
victory are recomputed rather than trusting the saved totals. The last archived
edition is remembered. Progress stays in this browser and origin, on this device;
changing ports, clearing browser storage, or private browsing may lose access to
saves. Storage failures show a warning. No cross-device sync is provided.

## Weekly rhythm

Monday's verified reference route adds 1 word; Tuesday through Friday add 2, 3, 4,
and 5; Saturday adds 7; Sunday adds 2. Starting nodes change along two chains, late
week bridges span five rather than three letters, and Saturday uses WOLF to offer
less familiar letter choices. Date-seeded starter alternatives, orientation, and
translation vary the board. These are **difficulty estimates**, not measured human
success rates. Reference route lengths and scores are measured for that legal
route, not proven minimum solutions. The interface explains this distinction.

The generator constructs a legal reference solution, and the same placement
validator verifies it before an edition is displayed. A fixed family of route
templates is used, so patterns and starting pairs can recur over time. This is a
daily cadence upgrade, not an unlimited supply of completely novel topology.

## Rules and vocabulary

Connect the two free starting words on a 15 × 15 board. Select a first cell, choose
horizontal or vertical, enter a word, preview, then add. Ordinary words cross
exactly one existing word perpendicularly at matching letters. The finishing
bridge crosses exactly two words, one in each separate starting chain. Same-direction
overlaps, conflicting letters, out-of-bounds placements, and side touching are
rejected. Every accepted word costs 10 plus its letters; lower scores are better.
Invalid tries change neither the board nor the score.

The bundled English list has 359,039 usable entries plus guaranteed puzzle words.
Only alphabetic entries of 2–15 letters are accepted. It is not every dictionary,
does not provide definitions, and may include uncommon or dated vocabulary.
Hyphenated and accented entries are excluded; proper-name filtering is not perfect.
If the asset fails to load, a small disclosed fallback still allows the reference
solutions. No hints reveal an entire route at once: nudges become more specific
only when requested repeatedly.

## Verification performed

- Completed October 3, 2026 through actual browser controls: LIMP +14, MAP +13,
  PARK +14, CREST +15, EAST +14, TEST +14, APART +15 = **99**. APART was previewed
  as the finishing bridge; the victory panel displayed the final score and next
  New York release time.
- Refreshed after one accepted move and after victory: unfinished score 14 and
  completed score 99 restored. Completed placement controls were disabled.
- Opened October 2, added LAMP and MAP (14 then 27), refreshed the archived edition,
  and returned to today. Dates kept independent scores and the archive indicated
  in-progress versus completed. An archived refresh retains the selected date.
- Actual controls rejected an off-board word, an unconnected word, and a
  a conflicting letter, and a same-direction HILLTOP overlap; none increased the score. Engine tests also
  cover matching-letter valid intersections, letter conflicts, overlap rejection,
  final bridges, and invalid-state invariance.
- Tested 365 dates from launch: all deterministic on repeated generation and all
  reference solutions legal under the real validator. The first seven dates have
  distinct starting layouts. A separately evaluated generator produced the same
  October 3 edition, independent of prior state.
  A fresh browser-storage origin at port 8003 also displayed the same WOLF/CAMP
  words and coordinates as port 8002, with a clean zero score.
- Unit tests used simulated instants immediately before/after New York midnight,
  including summer time, fall DST, and spring DST.
  The actual rollover handler was separately exercised with controlled dates:
  today advances at midnight, while an archive view stays open.
  Future and pre-launch dates were rejected; October 4 was visibly disabled in the October 3 archive. We did
  not wait for a real midnight during browser testing.
- Inspected desktop and 390 × 844 mobile layouts and accepted MAP through the
  mobile controls. The archive uses symbols with a visible legend and full
  accessible date/status labels. Grid width was corrected to avoid unnecessary
  scrolling at this size; very narrow screens may still scroll within the grid.
- Removed all player-facing Retry, Replay, and New Puzzle actions. The remaining
  navigation is Today and the available archive, with staged nudges preserved.

## Remaining limitations / lunch-table assessment

No user study or exhaustive accessibility/device audit has been conducted.
Difficulty is not statistically calibrated and alternative solutions can be much
shorter than the reference route. Browser storage and the local clock are the
only persistence/time authorities: a static site cannot prevent clock tampering.
Open tabs on the same origin do not synchronize live.

Morgan has a better reason to return tomorrow: a known daily edition, a lighter
Sunday, and a readable completion history. Catching up in the archive is inviting
right now. However, the finite route families may become recognizable after
several weeks; this upgrade does not yet guarantee long-term puzzle novelty.
