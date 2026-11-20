"""Build src/data/*.json from Data Dragon + the curated champion DB."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from champion_db import CHAMPIONS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "src", "data")
os.makedirs(OUT, exist_ok=True)

FEATURES = ["poke","sustain","allin","scaling","early","mobility","cc","durability",
            "waveclear","burst","dps","peel","engage","antitank","antimobile",
            "safety","splitpush","roam"]

# Base vector per Riot class taxonomy. Values are 0..1.
CLASS_BASE = {
 "juggernaut":  dict(poke=.20,sustain=.60,allin=.85,scaling=.60,early=.60,mobility=.12,cc=.50,durability=.80,waveclear=.50,burst=.35,dps=.75,peel=.35,engage=.40,safety=.35,splitpush=.55,roam=.20),
 "diver":       dict(poke=.25,sustain=.45,allin=.90,scaling=.50,early=.70,mobility=.70,cc=.60,durability=.60,waveclear=.45,burst=.60,dps=.60,peel=.35,engage=.85,safety=.35,splitpush=.45,roam=.50),
 "skirmisher":  dict(poke=.25,sustain=.50,allin=.75,scaling=.70,early=.50,mobility=.65,cc=.35,durability=.50,waveclear=.50,burst=.45,dps=.85,peel=.30,engage=.45,safety=.40,splitpush=.70,roam=.35),
 "assassin":    dict(poke=.30,sustain=.25,allin=.80,scaling=.55,early=.55,mobility=.80,cc=.30,durability=.25,waveclear=.50,burst=.95,dps=.45,peel=.15,engage=.55,safety=.35,splitpush=.55,roam=.70),
 "burst_mage":  dict(poke=.65,sustain=.25,allin=.55,scaling=.60,early=.55,mobility=.30,cc=.60,durability=.28,waveclear=.70,burst=.90,dps=.40,peel=.40,engage=.30,safety=.45,splitpush=.30,roam=.40),
 "battle_mage": dict(poke=.50,sustain=.55,allin=.60,scaling=.75,early=.40,mobility=.30,cc=.55,durability=.50,waveclear=.80,burst=.50,dps=.75,peel=.40,engage=.30,safety=.45,splitpush=.35,roam=.25),
 "artillery":   dict(poke=.95,sustain=.20,allin=.25,scaling=.75,early=.45,mobility=.20,cc=.45,durability=.20,waveclear=.90,burst=.60,dps=.50,peel=.35,engage=.10,safety=.50,splitpush=.30,roam=.20),
 "marksman":    dict(poke=.50,sustain=.25,allin=.45,scaling=.88,early=.35,mobility=.40,cc=.25,durability=.25,waveclear=.70,burst=.35,dps=.92,peel=.25,engage=.20,safety=.40,splitpush=.45,roam=.20),
 "enchanter":   dict(poke=.40,sustain=.80,allin=.20,scaling=.65,early=.40,mobility=.30,cc=.45,durability=.28,waveclear=.30,burst=.20,dps=.25,peel=.90,engage=.15,safety=.55,splitpush=.10,roam=.30),
 "catcher":     dict(poke=.50,sustain=.30,allin=.45,scaling=.55,early=.55,mobility=.40,cc=.90,durability=.40,waveclear=.40,burst=.45,dps=.30,peel=.65,engage=.70,safety=.35,splitpush=.15,roam=.40),
 "warden":      dict(poke=.25,sustain=.55,allin=.40,scaling=.60,early=.50,mobility=.25,cc=.70,durability=.90,waveclear=.35,burst=.20,dps=.30,peel=.88,engage=.40,safety=.60,splitpush=.25,roam=.25),
 "vanguard":    dict(poke=.25,sustain=.45,allin=.60,scaling=.60,early=.55,mobility=.40,cc=.90,durability=.85,waveclear=.45,burst=.35,dps=.35,peel=.60,engage=.95,safety=.50,splitpush=.25,roam=.35),
 "specialist":  dict(poke=.60,sustain=.45,allin=.45,scaling=.60,early=.50,mobility=.35,cc=.45,durability=.45,waveclear=.65,burst=.45,dps=.50,peel=.40,engage=.30,safety=.45,splitpush=.60,roam=.35),
}

# flag -> {feature: delta}. Unknown flags are recorded as tags only.
FLAG_DELTA = {
 "poke":        dict(poke=.22),
 "antipoke":    dict(sustain=.15,safety=.10),
 "sustain":     dict(sustain=.25),
 "allin":       dict(allin=.18),
 "scaling":     dict(scaling=.18,early=-.08),
 "hypercarry":  dict(scaling=.12,dps=.08,early=-.08),
 "early":       dict(early=.22,scaling=-.06),
 "mobile":      dict(mobility=.22,safety=.08),
 "hardcc":      dict(cc=.22),
 "pointclick":  dict(cc=.10,antimobile=.25),
 "antimobile":  dict(antimobile=.30),
 "tanky":       dict(durability=.20),
 "waveclear":   dict(waveclear=.20),
 "burst":       dict(burst=.18),
 "dps":         dict(dps=.15),
 "peel":        dict(peel=.18),
 "engage":      dict(engage=.20),
 "disengage":   dict(peel=.15,safety=.10),
 "antitank":    dict(antitank=.35),
 "truedmg":     dict(antitank=.20),
 "invuln":      dict(safety=.20),
 "safe":        dict(safety=.22),
 "splitpush":   dict(splitpush=.22),
 "roam":        dict(roam=.28),
 "global":      dict(roam=.22),
 "zone":        dict(waveclear=.10,poke=.08),
 "longrange":   dict(poke=.12,safety=.10),
 "antiad":      {},      # handled as a tag (bonus vs AD enemies)
 "antimagic":   {},      # tag (bonus vs AP enemies)
 "antiheal":    {},      # tag
 "antiheal_weak": {},
 "skillshot":   {},      # tag: punished by mobile enemies
 "range":       {},
}

def clamp(x, lo=0.02, hi=0.99):
    return round(max(lo, min(hi, x)), 3)

def build_champions():
    dd = json.load(open(os.path.join(RAW, "champion.json")))
    patch = dd["version"]
    out = {}
    unknown = sorted(set(dd["data"]) - set(CHAMPIONS))
    if unknown:
        raise SystemExit(
            f"New champions on patch {patch} are missing from scripts/champion_db.py: "
            + ", ".join(unknown)
        )
    for cid, c in dd["data"].items():
        lanes, klass, dmg, flagstr = CHAMPIONS[cid]
        flags = [f for f in flagstr.split(",") if f]
        vec = dict(CLASS_BASE[klass])
        for f in flags:
            for k, v in FLAG_DELTA.get(f, {}).items():
                vec[k] = vec.get(k, .4) + v
        st = c["stats"]
        rng = st["attackrange"]
        # stat-derived corrections, so the model tracks the live patch not just my table
        base_tank = (st["hp"] + 18 * st["hpperlevel"]) / 3000 * .5 \
                  + (st["armor"] + 18 * st["armorperlevel"]) / 180 * .3 \
                  + (st["spellblock"] + 18 * st["spellblockperlevel"]) / 110 * .2
        vec["durability"] = vec.get("durability", .4) * .7 + clamp(base_tank) * .3
        vec = {k: clamp(v) for k, v in vec.items()}
        for k in FEATURES:
            vec.setdefault(k, .4)
        out[cid] = {
            "id": cid,
            "key": int(c["key"]),
            "name": c["name"],
            "title": c["title"],
            "lanes": lanes.split(","),
            "class": klass,
            "damage": dmg,
            "tags": flags,
            "ddTags": c["tags"],
            "range": rng,
            "melee": rng <= 325,
            "difficulty": c["info"]["difficulty"],
            "resource": c["partype"],
            "f": vec,
        }
    return patch, out

STYLE_ORDER = ["Precision", "Domination", "Sorcery", "Resolve", "Inspiration"]

def build_runes():
    rr = json.load(open(os.path.join(RAW, "runesReforged.json")))
    trees = {}
    for t in rr:
        trees[t["key"]] = {
            "id": t["id"], "key": t["key"], "name": t["name"], "icon": t["icon"],
            "slots": [[{"id": r["id"], "key": r["key"], "name": r["name"],
                        "icon": r["icon"], "short": r["shortDesc"]}
                       for r in s["runes"]] for s in t["slots"]],
        }
    return trees

if __name__ == "__main__":
    patch, champs = build_champions()
    json.dump({"patch": patch, "champions": champs},
              open(os.path.join(OUT, "champions.json"), "w"), separators=(",", ":"))
    json.dump({"patch": patch, "trees": build_runes()},
              open(os.path.join(OUT, "runes.json"), "w"), separators=(",", ":"))
    print("patch", patch, "champions", len(champs))
    for cid in ["Darius", "Vayne", "Malzahar", "Soraka"]:
        c = champs[cid]
        print(cid, c["lanes"], c["class"], c["damage"],
              {k: v for k, v in sorted(c["f"].items()) if v > .7})
