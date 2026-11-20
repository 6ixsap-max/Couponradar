# LaneIQ

Build your League of Legends champion pool, say who you are laning against, and get the
best pick **from your own pool** — with the reasoning shown and a rune page that imports
straight into the client.

Patch **16.23.1** · 173 champions · no account, no server, no tracking.

---

## What it does

**Profile** — summoner name, region, rank, main lane. Stored in your browser only.

**Champion pool** — add champions per lane, record games, wins and a 1-5 comfort rating.
That record is what makes the recommendation yours rather than a generic tier list.

**Counter pick** — pick the enemy laner and every champion in your pool is ranked with a
projected win rate, a laning-phase bar, a mid/late-game bar, and plain-English reasons for
and against. It also suggests strong champions that are *not* in your pool yet.

**Runes** — a matchup-aware rune page for the pick, every rune with a one-line reason, plus
summoner spells and build adjustments. One button sends it to your League client.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build:

```bash
npm run build && npm run preview
```

The app is a static site. `dist/` can be hosted anywhere.

### Rune import (the local bridge)

A web page cannot reach the League client directly — the League Client API runs on a random
port, over HTTPS with a self-signed certificate, behind a password that changes every launch.
A small local bridge reads that password from the client's own lockfile:

```bash
npm run bridge       # or: python3 bridge/lcu_bridge.py
```

Python 3.9+, no dependencies to install. Leave it running while you play. With League open
you get:

- **Import into League client** — creates the rune page and selects it
- **Read from champion select** — fills in the enemy laner and your assigned lane
- **Import top mastery from client** — seeds your pool from your actual mastery

Without the bridge everything else still works; you copy the rune page in by hand.

The bridge only ever deletes a rune page whose name starts with `LaneIQ`. Your own pages are
never touched. If League is installed somewhere unusual, point it at the lockfile:

```bash
LANEIQ_LOCKFILE="/path/to/League of Legends/lockfile" npm run bridge
```

Browser note: the import button calls `http://127.0.0.1:7171`. Chrome allows this from an
https page (localhost counts as a trustworthy origin and the bridge sends the required
Private Network Access header). Firefox and Safari are stricter — run the app locally with
`npm run dev` there.

---

## How the recommendation is calculated

Every champion carries an 18-dimension feature vector — poke, sustain, all-in, scaling,
early power, mobility, crowd control, durability, wave clear, burst, sustained damage, peel,
engage, anti-tank, anti-mobility, safety, split push, roam. It is built from three things:

1. the champion's class in Riot's taxonomy (juggernaut, diver, skirmisher, assassin, burst
   mage, battle mage, artillery, marksman, enchanter, catcher, warden, vanguard, specialist),
2. hand-maintained kit flags in `scripts/champion_db.py`,
3. live base stats from Data Dragon, so durability tracks the current patch.

`src/engine/matchup.ts` compares your champion against the enemy over thirteen weighted
terms — range war, poke versus sustain, the all-in, crowd control versus mobility, skillshot
reliance, burst threat, wave control, damage type, early tempo, scaling, anti-tank, teamfight
utility, map pressure. Term weights change per lane: wave clear barely matters in support,
scaling matters most for ADCs, all-in matters most in top lane.

`src/engine/counters.ts` adds specific lane dynamics the numbers cannot see — a spell shield
blanking a hook, suppression beating a dash, true damage ignoring a parry.

Your own record is folded in last. The win rate is shrunk toward 50% with a 20-game prior, so
a 3-0 start does not outrank a 40-game sample, then blended at the weight you choose with the
slider (default 35%).

The result lands between roughly 43% and 57% before your personal record is applied — the
honest size of a counter-pick swing.

### What this is not

These are **not scraped live win rates** from a stats site. There is no public, licensed feed
of champion-versus-champion win rates, and inventing precise-looking numbers would be worse
than useless. This is a transparent model: every number comes with the reasoning that
produced it, so you can disagree with any individual line.

If you have real matchup data, `evaluateMatchup` is the single place to blend it in.

---

## Layout

```
src/engine/matchup.ts     the thirteen-term matchup model
src/engine/counters.ts    curated lane dynamics
src/engine/runes.ts       matchup-aware rune, spell and item logic
scripts/champion_db.py    the hand-maintained champion knowledge base
scripts/build_data.py     Data Dragon + knowledge base -> src/data/*.json
scripts/selftest.ts       validates every matchup and 34,000 rune pages
bridge/lcu_bridge.py      the local League client bridge
```

### Updating to a new patch

```bash
curl -s "https://ddragon.leagueoflegends.com/api/versions.json"       # newest first
# then re-download champion.json + runesReforged.json into raw/ for that version
npm run data
```

New champions will be missing from `scripts/champion_db.py` — the build fails loudly until
you add them, which is deliberate.

### Self-test

```bash
npx esbuild scripts/selftest.ts --bundle --platform=node --format=cjs \
  --outfile=/tmp/selftest.cjs && node /tmp/selftest.cjs
```

Checks all 29,756 matchups for sane output and builds 34,400 rune pages, asserting that every
rune id exists, trees never collide and no page has duplicates.

---

LaneIQ isn't endorsed by Riot Games and doesn't reflect their views. League of Legends and
Riot Games are trademarks of Riot Games, Inc. Champion and rune data come from Data Dragon.
