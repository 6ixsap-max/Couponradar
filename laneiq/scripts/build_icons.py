"""Inline every champion and rune icon as a data URI.

Only needed for a hosted build whose sandbox blocks Riot's image CDN. The
normal dev build loads them from Data Dragon and keeps src/data/icons.json
empty. Run scripts/build_data.py first so raw/ is populated.

    python3 scripts/build_icons.py            # fill icons.json
    python3 scripts/build_icons.py --clear    # empty it again
"""
import base64, glob, io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "icons.json")

if "--clear" in sys.argv:
    json.dump({"champions": {}, "runes": {}}, open(OUT, "w"))
    print("icons.json cleared")
    raise SystemExit

from PIL import Image

def encode(path: str, size: int, quality: int) -> str:
    img = Image.open(path).convert("RGBA").resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

champions, runes = {}, {}
for path in sorted(glob.glob(os.path.join(ROOT, "raw", "img", "champ_*.png"))):
    champions[os.path.basename(path)[6:-4]] = encode(path, 64, 82)
for prefix, key_from in (("rune_", lambda n: n[5:-4]), ("style_", lambda n: n[6:-4])):
    for path in sorted(glob.glob(os.path.join(ROOT, "raw", "img", prefix + "*.png"))):
        runes[key_from(os.path.basename(path))] = encode(path, 48, 82)

json.dump({"champions": champions, "runes": runes}, open(OUT, "w"), separators=(",", ":"))
size = os.path.getsize(OUT)
print(f"icons.json: {len(champions)} champions + {len(runes)} runes, {size/1024/1024:.2f} MB")
