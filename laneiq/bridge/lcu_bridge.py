#!/usr/bin/env python3
"""
LaneIQ bridge — the only piece that can talk to your League client.

A browser tab cannot reach the League Client API: it is HTTPS on a random port
with a self-signed certificate and a password that changes every launch. This
small local server reads that password from the client's own lockfile and
exposes four endpoints to the LaneIQ page running on this machine.

    python3 bridge/lcu_bridge.py

Nothing leaves your machine. There is no account, no API key and no telemetry.

Endpoints
    GET  /health       is the client running, and who is logged in
    GET  /mastery      your champion mastery, highest first
    GET  /champselect  enemy champions locked in right now
    POST /runes        create the rune page and make it active

Safety: it will only ever delete a rune page whose name starts with "LaneIQ".
Your own pages are never touched.
"""
from __future__ import annotations

import base64
import glob
import json
import os
import platform
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("LANEIQ_PORT", "7171"))
PAGE_PREFIX = "LaneIQ"

# The client's certificate is self-signed by Riot and only ever used on
# 127.0.0.1, so verification is turned off for this one connection.
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


class LcuError(Exception):
    pass


# --------------------------------------------------------------- credentials
def _lockfile_candidates() -> list[str]:
    env = os.environ.get("LANEIQ_LOCKFILE")
    if env:
        return [env]
    system = platform.system()
    if system == "Windows":
        return [
            r"C:\Riot Games\League of Legends\lockfile",
            r"D:\Riot Games\League of Legends\lockfile",
            *glob.glob(r"C:\Program Files*\Riot Games\League of Legends\lockfile"),
        ]
    if system == "Darwin":
        return [
            "/Applications/League of Legends.app/Contents/LoL/lockfile",
            os.path.expanduser("~/Applications/League of Legends.app/Contents/LoL/lockfile"),
        ]
    # Linux (Wine / Lutris installs vary wildly, so look in the usual prefixes)
    return glob.glob(os.path.expanduser("~/**/League of Legends/lockfile"), recursive=True)[:5]


def _from_process() -> tuple[int, str] | None:
    """Ask the running client process for its port and auth token."""
    try:
        if platform.system() == "Windows":
            out = subprocess.run(
                ["wmic", "PROCESS", "WHERE", "name='LeagueClientUx.exe'", "GET", "CommandLine"],
                capture_output=True, text=True, timeout=5).stdout
        else:
            out = subprocess.run(["ps", "-A", "-o", "args"],
                                 capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return None
    port = re.search(r"--app-port=(\d+)", out)
    token = re.search(r"--remoting-auth-token=([\w-]+)", out)
    if port and token:
        return int(port.group(1)), token.group(1)
    return None


def credentials() -> tuple[int, str]:
    for path in _lockfile_candidates():
        try:
            with open(path, "r", encoding="utf-8") as fh:
                parts = fh.read().strip().split(":")
            if len(parts) >= 4:
                return int(parts[2]), parts[3]
        except (OSError, ValueError):
            continue
    found = _from_process()
    if found:
        return found
    raise LcuError(
        "League client not found. Start League of Legends and log in, then try again. "
        "If it is installed somewhere unusual, set LANEIQ_LOCKFILE to the full path of its lockfile."
    )


# ------------------------------------------------------------------ LCU call
def lcu(method: str, path: str, body: dict | list | None = None):
    port, password = credentials()
    url = f"https://127.0.0.1:{port}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Basic " + base64.b64encode(f"riot:{password}".encode()).decode())
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=_SSL, timeout=8) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:300]
        raise LcuError(f"League client refused {method} {path}: {err.code} {detail}") from err
    except urllib.error.URLError as err:
        raise LcuError(f"Could not reach the League client: {err.reason}") from err


# ----------------------------------------------------------------- behaviours
def health() -> dict:
    try:
        me = lcu("GET", "/lol-summoner/v1/current-summoner")
    except LcuError as err:
        return {"clientConnected": False, "error": str(err)}
    name = me.get("gameName") or me.get("displayName") or "Summoner"
    tag = me.get("tagLine")
    return {
        "clientConnected": True,
        "summoner": {
            "name": f"{name}#{tag}" if tag else name,
            "level": me.get("summonerLevel", 0),
            "puuid": me.get("puuid", ""),
        },
    }


def mastery() -> dict:
    for path in (
        "/lol-champion-mastery/v1/local-player/champion-mastery",
        "/lol-collections/v1/inventories/local-player/champion-mastery",
    ):
        try:
            data = lcu("GET", path)
        except LcuError:
            continue
        if isinstance(data, list):
            entries = sorted(data, key=lambda m: m.get("championPoints", 0), reverse=True)
            return {"mastery": [
                {"championId": m.get("championId"),
                 "championLevel": m.get("championLevel", 0),
                 "championPoints": m.get("championPoints", 0)}
                for m in entries if m.get("championId")
            ]}
    raise LcuError("Could not read champion mastery from this client version.")


def champ_select() -> dict:
    try:
        session = lcu("GET", "/lol-champ-select/v1/session")
    except LcuError:
        return {"inChampSelect": False, "enemyChampionIds": [], "bans": []}
    if not session:
        return {"inChampSelect": False, "enemyChampionIds": [], "bans": []}

    my_cell = session.get("localPlayerCellId")
    my_position, my_champion = None, None
    for p in session.get("myTeam", []):
        if p.get("cellId") == my_cell:
            my_position = p.get("assignedPosition") or None
            my_champion = p.get("championId") or p.get("championPickIntent") or None

    enemies: list[int] = []
    for p in session.get("theirTeam", []):
        cid = p.get("championId") or p.get("championPickIntent") or 0
        if cid:
            enemies.append(cid)
    # In blind pick the enemy team is hidden; picks also show up in the action list.
    for group in session.get("actions", []) or []:
        for act in group:
            if act.get("type") == "pick" and act.get("completed") and not act.get("isAllyAction"):
                cid = act.get("championId") or 0
                if cid and cid not in enemies:
                    enemies.append(cid)

    bans = session.get("bans", {}) or {}
    return {
        "inChampSelect": True,
        "myPosition": my_position,
        "myChampionId": my_champion,
        "enemyChampionIds": enemies,
        "bans": (bans.get("myTeamBans") or []) + (bans.get("theirTeamBans") or []),
    }


def apply_runes(page: dict) -> dict:
    required = {"name", "primaryStyleId", "subStyleId", "selectedPerkIds"}
    missing = required - page.keys()
    if missing:
        raise LcuError(f"rune page is missing {', '.join(sorted(missing))}")
    if len(page["selectedPerkIds"]) != 9:
        raise LcuError("a rune page needs exactly 9 perk ids (6 runes + 3 shards)")

    name = page["name"][:24]
    if not name.startswith(PAGE_PREFIX):
        name = f"{PAGE_PREFIX} {name}"[:24]

    pages = lcu("GET", "/lol-perks/v1/pages") or []
    # Reuse our own slot rather than filling the player's page list.
    for existing in pages:
        if existing.get("isDeletable") and str(existing.get("name", "")).startswith(PAGE_PREFIX):
            lcu("DELETE", f"/lol-perks/v1/page/{existing['id']}")

    inventory = lcu("GET", "/lol-perks/v1/inventory") or {}
    owned = inventory.get("ownedPageCount", 2)
    remaining = [p for p in lcu("GET", "/lol-perks/v1/pages") or [] if p.get("isDeletable")]
    if owned and len(remaining) >= owned:
        raise LcuError(
            f"All {owned} of your rune pages are full and none of them is a LaneIQ page. "
            "Delete one page in the client, or copy the runes in by hand."
        )

    created = lcu("POST", "/lol-perks/v1/pages", {
        "name": name,
        "primaryStyleId": int(page["primaryStyleId"]),
        "subStyleId": int(page["subStyleId"]),
        "selectedPerkIds": [int(x) for x in page["selectedPerkIds"]],
        "current": True,
    })
    page_id = (created or {}).get("id")
    if page_id:
        try:
            lcu("PUT", "/lol-perks/v1/currentpage", page_id)
        except LcuError:
            pass
    return {"applied": True, "pageId": page_id, "name": name}


# --------------------------------------------------------------- http server
ROUTES_GET = {"/health": health, "/mastery": mastery, "/champselect": champ_select}


class Handler(BaseHTTPRequestHandler):
    server_version = "LaneIQBridge/1.0"

    def _cors(self):
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # Chrome's Private Network Access check for https page -> localhost
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        fn = ROUTES_GET.get(path)
        if not fn:
            return self._json(404, {"error": f"no such endpoint: {path}"})
        try:
            self._json(200, fn())
        except LcuError as err:
            self._json(502, {"error": str(err)})
        except Exception as err:                       # noqa: BLE001
            self._json(500, {"error": f"{type(err).__name__}: {err}"})

    def do_POST(self):
        if self.path.split("?")[0] != "/runes":
            return self._json(404, {"error": "no such endpoint"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._json(200, apply_runes(payload))
        except LcuError as err:
            self._json(502, {"error": str(err)})
        except Exception as err:                       # noqa: BLE001
            self._json(400, {"error": f"{type(err).__name__}: {err}"})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"  {self.address_string()} {fmt % args}\n")


def main():
    print(f"LaneIQ bridge listening on http://127.0.0.1:{PORT}")
    state = health()
    print("League client:", "connected as " + state["summoner"]["name"]
          if state["clientConnected"] else "not running yet (that is fine, start it any time)")
    print("Leave this window open while you play. Ctrl+C to stop.\n")
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nbridge stopped")


if __name__ == "__main__":
    main()
