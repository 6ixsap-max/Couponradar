#!/usr/bin/env python3
"""Personal AI Assistant — terminal agent powered by Claude."""

import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# Load .env if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─── Dependency check ────────────────────────────────────────────────────────

def _check_deps():
    missing = []
    try:
        import anthropic  # noqa: F401
    except ImportError:
        missing.append("anthropic")
    try:
        import rich  # noqa: F401
    except ImportError:
        missing.append("rich")
    if missing:
        print(f"Missing packages: {', '.join(missing)}")
        print(f"Run: pip install {' '.join(missing)}")
        sys.exit(1)

_check_deps()

import anthropic
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Confirm, Prompt

console = Console()

# ─── Config ──────────────────────────────────────────────────────────────────

MODEL = os.getenv("ASSISTANT_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "8096"))
DATA_DIR = Path(os.getenv("ASSISTANT_DATA_DIR", Path.home() / ".assistant"))
CALENDAR_FILE = DATA_DIR / "calendar.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SYSTEM_PROMPT = (
    "You are a highly capable personal AI assistant running in the terminal. "
    "Act like a capable colleague — autonomous, efficient, and proactive.\n\n"
    "## Style\n"
    "- Conversational but efficient — no fluff\n"
    "- Use terminal-friendly formatting: sections, bullet points, code blocks\n"
    "- After multi-step tasks, print a concise summary: what was done, what changed, any follow-up\n"
    "- Make reasonable assumptions when tasks are ambiguous; state them in the summary\n\n"
    "## Autonomy\n"
    "- Act autonomously on routine actions (reading, searching, writing, fetching)\n"
    "- For destructive operations, set destructive=true on run_command (triggers confirmation)\n"
    "- delete_file and calendar_delete always trigger user confirmation\n"
    "- Be proactive: flag bugs, outdated deps, scheduling conflicts you notice\n\n"
    "## Capabilities\n"
    "- run_command: shell/terminal commands, tests, installs, git\n"
    "- read_file / write_file: read and write any text file\n"
    "- list_directory / search_files / move_file / delete_file: full filesystem ops\n"
    "- web_search / fetch_url: live web info and page content\n"
    "- calendar_*: local calendar events (JSON-backed)\n"
    "- store_memory / recall_memory: session-scoped key-value notes\n\n"
    f"Current date/time: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
    f"OS: {sys.platform} | CWD: {Path.cwd()}"
)

# ─── Calendar helpers ─────────────────────────────────────────────────────────

def _load_calendar() -> list[dict]:
    if CALENDAR_FILE.exists():
        try:
            return json.loads(CALENDAR_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_calendar(events: list[dict]) -> None:
    CALENDAR_FILE.write_text(json.dumps(events, indent=2, default=str), encoding="utf-8")


def _parse_dt(s: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse datetime: {s!r}. Use YYYY-MM-DD HH:MM")


# ─── Tool implementations ─────────────────────────────────────────────────────

def tool_run_command(command: str, working_dir: str = None, timeout: int = 60, destructive: bool = False) -> dict:
    cwd = Path(working_dir).expanduser() if working_dir else Path.cwd()
    try:
        if sys.platform == "win32":
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
                capture_output=True, text=True, cwd=str(cwd), timeout=timeout
            )
        else:
            proc = subprocess.run(
                command, shell=True, capture_output=True, text=True, cwd=str(cwd), timeout=timeout
            )
        out = proc.stdout.strip()
        err = proc.stderr.strip()
        combined = out + (f"\n[stderr]\n{err}" if err else "")
        return {"success": proc.returncode == 0, "exit_code": proc.returncode, "output": combined or "(no output)"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Command timed out after {timeout}s"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_read_file(path: str) -> dict:
    p = Path(path).expanduser()
    if not p.exists():
        return {"success": False, "error": f"Not found: {path}"}
    if not p.is_file():
        return {"success": False, "error": f"Not a file: {path}"}
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
        return {"success": True, "path": str(p.resolve()), "content": content, "lines": content.count("\n") + 1}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_write_file(path: str, content: str, mode: str = "write") -> dict:
    p = Path(path).expanduser()
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(p, "a" if mode == "append" else "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "path": str(p.resolve()), "bytes": len(content.encode()), "mode": mode}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_list_directory(path: str = ".", show_hidden: bool = False) -> dict:
    p = Path(path).expanduser()
    if not p.exists():
        return {"success": False, "error": f"Not found: {path}"}
    try:
        entries = []
        for item in sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
            if not show_hidden and item.name.startswith("."):
                continue
            stat = item.stat()
            entries.append({
                "name": item.name,
                "type": "dir" if item.is_dir() else "file",
                "size": stat.st_size if item.is_file() else None,
                "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            })
        return {"success": True, "path": str(p.resolve()), "entries": entries, "count": len(entries)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_search_files(pattern: str, path: str = ".", search_type: str = "content", file_pattern: str = None) -> dict:
    base = Path(path).expanduser()
    try:
        if search_type == "filename":
            glob = f"**/*{pattern}*" if not any(c in pattern for c in "*?[]") else f"**/{pattern}"
            matches = [str(f) for f in base.glob(glob)][:50]
            return {"success": True, "matches": matches, "count": len(matches)}

        # Content search (Python-based, cross-platform)
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error:
            regex = re.compile(re.escape(pattern), re.IGNORECASE)

        glob_pat = f"**/{file_pattern}" if file_pattern else "**/*"
        results = []
        for f in base.glob(glob_pat):
            if not f.is_file() or f.stat().st_size > 5_000_000:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
                hit_lines = [
                    f"{i + 1}: {ln.strip()[:120]}"
                    for i, ln in enumerate(text.splitlines())
                    if regex.search(ln)
                ]
                if hit_lines:
                    results.append({"file": str(f), "matches": hit_lines[:6]})
                    if len(results) >= 20:
                        break
            except Exception:
                pass
        return {"success": True, "files_with_matches": [r["file"] for r in results], "details": results, "total": len(results)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_move_file(source: str, destination: str) -> dict:
    src, dst = Path(source).expanduser(), Path(destination).expanduser()
    if not src.exists():
        return {"success": False, "error": f"Source not found: {source}"}
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        return {"success": True, "moved_from": str(src), "moved_to": str(dst)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_delete_file(path: str, recursive: bool = False) -> dict:
    p = Path(path).expanduser()
    if not p.exists():
        return {"success": False, "error": f"Not found: {path}"}
    try:
        if p.is_dir():
            if not recursive:
                return {"success": False, "error": "Use recursive=true to delete directories"}
            shutil.rmtree(str(p))
        else:
            p.unlink()
        return {"success": True, "deleted": str(p)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_web_search(query: str) -> dict:
    # Try the current package name first, then the legacy name
    for module in ("ddgs", "duckduckgo_search"):
        try:
            mod = __import__(module, fromlist=["DDGS"])
            DDGS = mod.DDGS
            with DDGS() as ddgs:
                raw = list(ddgs.text(query, max_results=8))
            results = [{"title": r["title"], "url": r["href"], "snippet": r["body"]} for r in raw]
            return {"success": True, "query": query, "results": results}
        except ImportError:
            continue
        except Exception as e:
            return {"success": False, "error": str(e)}
    return {"success": False, "error": "Web search unavailable. Run: pip install ddgs"}


def tool_fetch_url(url: str, extract_text: bool = True) -> dict:
    try:
        import httpx
        r = httpx.get(url, follow_redirects=True, timeout=15,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; PersonalAssistant/1.0)"})
        r.raise_for_status()
        if not extract_text:
            return {"success": True, "url": url, "status": r.status_code, "content": r.text[:10000]}
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            title = soup.title.string.strip() if soup.title else ""
            text = " ".join(soup.get_text(separator=" ").split())
            return {"success": True, "url": url, "title": title, "text": text[:8000]}
        except ImportError:
            return {"success": True, "url": url, "text": r.text[:8000]}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_calendar_list(days_ahead: int = 7, include_past: bool = False) -> dict:
    events = _load_calendar()
    now = datetime.now()
    cutoff = now + timedelta(days=days_ahead)
    filtered = []
    for e in events:
        try:
            start = datetime.fromisoformat(e["start_time"])
            if (include_past or start >= now) and (include_past or start <= cutoff):
                filtered.append(e)
        except Exception:
            pass
    filtered.sort(key=lambda e: e["start_time"])
    return {"success": True, "events": filtered, "count": len(filtered)}


def tool_calendar_create(title: str, start_time: str, end_time: str = None,
                          description: str = "", location: str = "") -> dict:
    try:
        start_dt = _parse_dt(start_time)
        end_dt = _parse_dt(end_time) if end_time else start_dt + timedelta(hours=1)
        event = {
            "id": str(uuid.uuid4())[:8],
            "title": title,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "description": description,
            "location": location,
            "created": datetime.now().isoformat(),
        }
        events = _load_calendar()
        events.append(event)
        _save_calendar(events)
        return {"success": True, "event": event, "message": f"Created '{title}' on {start_dt.strftime('%b %d at %H:%M')}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tool_calendar_update(event_id: str, title: str = None, start_time: str = None,
                          end_time: str = None, description: str = None, location: str = None) -> dict:
    events = _load_calendar()
    for i, ev in enumerate(events):
        if ev["id"] == event_id:
            if title is not None:       ev["title"] = title
            if description is not None: ev["description"] = description
            if location is not None:    ev["location"] = location
            if start_time:
                try: ev["start_time"] = _parse_dt(start_time).isoformat()
                except ValueError as e: return {"success": False, "error": str(e)}
            if end_time:
                try: ev["end_time"] = _parse_dt(end_time).isoformat()
                except ValueError as e: return {"success": False, "error": str(e)}
            events[i] = ev
            _save_calendar(events)
            return {"success": True, "event": ev}
    return {"success": False, "error": f"Event {event_id!r} not found"}


def tool_calendar_delete(event_id: str) -> dict:
    events = _load_calendar()
    before = len(events)
    events = [e for e in events if e["id"] != event_id]
    if len(events) == before:
        return {"success": False, "error": f"Event {event_id!r} not found"}
    _save_calendar(events)
    return {"success": True, "deleted_id": event_id}


_session_memory: dict[str, str] = {}


def tool_store_memory(key: str, value: str) -> dict:
    _session_memory[key] = value
    return {"success": True, "stored": key, "total": len(_session_memory)}


def tool_recall_memory(key: str = None) -> dict:
    if key:
        val = _session_memory.get(key)
        if val is None:
            return {"success": False, "error": f"No memory for {key!r}", "available": list(_session_memory.keys())}
        return {"success": True, "key": key, "value": val}
    return {"success": True, "memories": _session_memory, "count": len(_session_memory)}


# ─── Tool definitions (API schema) ───────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "name": "run_command",
        "description": (
            "Execute a shell/terminal command. Use for running scripts, tests, installs (pip/npm/etc.), "
            "git operations, compiling code, or any system task. "
            "Set destructive=true for commands that delete or irreversibly modify data — this triggers user confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command":      {"type": "string",  "description": "Shell command to run"},
                "working_dir":  {"type": "string",  "description": "Working directory (optional, defaults to cwd)"},
                "timeout":      {"type": "integer", "description": "Timeout seconds (default: 60)"},
                "destructive":  {"type": "boolean", "description": "true = triggers confirmation before running"},
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read and return the full contents of a text file.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "File path to read"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write or append content to a file. Creates missing parent directories automatically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string"},
                "content": {"type": "string"},
                "mode":    {"type": "string", "enum": ["write", "append"], "description": "Default: write (overwrites)"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "list_directory",
        "description": "List files and subdirectories at a given path.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":        {"type": "string",  "description": "Directory path (default: current directory)"},
                "show_hidden": {"type": "boolean", "description": "Include hidden files (default: false)"},
            },
        },
    },
    {
        "name": "search_files",
        "description": "Search file contents for a pattern (like grep), or find files by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern":      {"type": "string", "description": "Regex or text pattern to search for"},
                "path":         {"type": "string", "description": "Root directory to search (default: cwd)"},
                "search_type":  {"type": "string", "enum": ["content", "filename"], "description": "Default: content"},
                "file_pattern": {"type": "string", "description": "Glob filter, e.g. '*.py' or '*.md'"},
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "move_file",
        "description": "Move or rename a file or directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source":      {"type": "string"},
                "destination": {"type": "string"},
            },
            "required": ["source", "destination"],
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file or directory. Always triggers user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":      {"type": "string"},
                "recursive": {"type": "boolean", "description": "Required to delete non-empty directories"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "web_search",
        "description": "Search the web for current information, news, documentation, or any topic.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Search query"}},
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": "Fetch a URL and return its readable text content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url":          {"type": "string"},
                "extract_text": {"type": "boolean", "description": "Strip HTML tags (default: true)"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "calendar_list",
        "description": "List upcoming (or past) calendar events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days_ahead":   {"type": "integer", "description": "Days to look ahead (default: 7)"},
                "include_past": {"type": "boolean", "description": "Include past events (default: false)"},
            },
        },
    },
    {
        "name": "calendar_create",
        "description": "Create a new calendar event in the local calendar.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":       {"type": "string"},
                "start_time":  {"type": "string", "description": "Format: YYYY-MM-DD HH:MM"},
                "end_time":    {"type": "string", "description": "Format: YYYY-MM-DD HH:MM (default: +1 hour)"},
                "description": {"type": "string"},
                "location":    {"type": "string"},
            },
            "required": ["title", "start_time"],
        },
    },
    {
        "name": "calendar_update",
        "description": "Update fields on an existing calendar event.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id":    {"type": "string", "description": "ID from calendar_list"},
                "title":       {"type": "string"},
                "start_time":  {"type": "string"},
                "end_time":    {"type": "string"},
                "description": {"type": "string"},
                "location":    {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "calendar_delete",
        "description": "Delete a calendar event. Always triggers user confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"event_id": {"type": "string", "description": "ID from calendar_list"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "store_memory",
        "description": "Store a key-value note in session memory for later recall.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key":   {"type": "string", "description": "Label for the memory"},
                "value": {"type": "string", "description": "Content to remember"},
            },
            "required": ["key", "value"],
        },
    },
    {
        "name": "recall_memory",
        "description": "Retrieve stored session memories. Omit key to get all.",
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Specific key (optional)"}},
        },
    },
]

# Tools that always require confirmation regardless of model setting
_ALWAYS_CONFIRM = {"delete_file", "calendar_delete"}

# ─── Tool dispatcher ──────────────────────────────────────────────────────────

_HANDLERS = {
    "run_command":      tool_run_command,
    "read_file":        tool_read_file,
    "write_file":       tool_write_file,
    "list_directory":   tool_list_directory,
    "search_files":     tool_search_files,
    "move_file":        tool_move_file,
    "delete_file":      tool_delete_file,
    "web_search":       tool_web_search,
    "fetch_url":        tool_fetch_url,
    "calendar_list":    tool_calendar_list,
    "calendar_create":  tool_calendar_create,
    "calendar_update":  tool_calendar_update,
    "calendar_delete":  tool_calendar_delete,
    "store_memory":     tool_store_memory,
    "recall_memory":    tool_recall_memory,
}


def dispatch(name: str, inputs: dict) -> str:
    handler = _HANDLERS.get(name)
    if not handler:
        return json.dumps({"success": False, "error": f"Unknown tool: {name}"})
    try:
        return json.dumps(handler(**inputs), indent=2, default=str)
    except TypeError as e:
        return json.dumps({"success": False, "error": f"Bad arguments: {e}"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


# ─── Display helpers ──────────────────────────────────────────────────────────

_ICONS = {
    "run_command": "⚡", "read_file": "📖", "write_file": "✏️",
    "list_directory": "📁", "search_files": "🔍", "move_file": "📦",
    "delete_file": "🗑️", "web_search": "🌐", "fetch_url": "🔗",
    "calendar_list": "📅", "calendar_create": "📅", "calendar_update": "📅",
    "calendar_delete": "📅", "store_memory": "🧠", "recall_memory": "🧠",
}


def _tool_summary(name: str, inputs: dict) -> str:
    mapping = {
        "run_command":    lambda i: i.get("command", "")[:70],
        "read_file":      lambda i: i.get("path", ""),
        "write_file":     lambda i: i.get("path", ""),
        "list_directory": lambda i: i.get("path", "."),
        "search_files":   lambda i: f'"{i.get("pattern","")}" in {i.get("path",".")}',
        "web_search":     lambda i: i.get("query", ""),
        "fetch_url":      lambda i: i.get("url", ""),
        "calendar_create":lambda i: i.get("title", ""),
    }
    fn = mapping.get(name)
    return fn(inputs) if fn else str(inputs)[:70]


def show_tool_call(name: str, inputs: dict) -> None:
    icon = _ICONS.get(name, "🔧")
    summary = _tool_summary(name, inputs)
    console.print(f"  {icon} [dim]{name}[/dim]  [cyan]{summary}[/cyan]", highlight=False)


def show_response(text: str) -> None:
    console.print()
    console.print(Markdown(text))
    console.print()


def ask_confirm(name: str, inputs: dict) -> bool:
    console.print()
    console.print(Panel(
        f"[yellow bold]⚠  Confirmation Required[/yellow bold]\n\n"
        f"Tool:  [bold]{name}[/bold]\n"
        f"Args:  [dim]{json.dumps(inputs, indent=2)}[/dim]",
        border_style="yellow",
    ))
    return Confirm.ask("[yellow]Proceed?[/yellow]", default=False)


# ─── Built-in slash commands ──────────────────────────────────────────────────

def cmd_calendar() -> None:
    result = tool_calendar_list(days_ahead=30)
    if not result["events"]:
        console.print("[dim]No upcoming events.[/dim]")
        return
    lines = []
    for e in result["events"]:
        start = datetime.fromisoformat(e["start_time"]).strftime("%b %d %H:%M")
        lines.append(f"[bold][{e['id']}][/bold] {start} — {e['title']}")
        if e.get("description"):
            lines.append(f"       {e['description'][:80]}")
        if e.get("location"):
            lines.append(f"       📍 {e['location']}")
    console.print(Panel("\n".join(lines), title="[cyan]Upcoming Events[/cyan]", border_style="cyan"))


def cmd_memory() -> None:
    if not _session_memory:
        console.print("[dim]No session memories.[/dim]")
        return
    lines = [f"[bold]{k}[/bold]: {v}" for k, v in _session_memory.items()]
    console.print(Panel("\n".join(lines), title="[cyan]Session Memory[/cyan]", border_style="cyan"))


SLASH_COMMANDS = {
    "/calendar": (cmd_calendar, "Show upcoming calendar events"),
    "/memory":   (cmd_memory,   "Show session memory"),
    "/help":     (None,          "Show this help"),
}


def cmd_help() -> None:
    lines = [
        "[bold cyan]Personal AI Assistant[/bold cyan]",
        "",
        "[bold]Built-in commands:[/bold]",
        "  [cyan]/calendar[/cyan]  — show upcoming events",
        "  [cyan]/memory[/cyan]    — show session memories",
        "  [cyan]/clear[/cyan]     — reset conversation history",
        "  [cyan]/help[/cyan]      — this message",
        "  [cyan]exit[/cyan]       — quit",
        "",
        "[bold]Tips:[/bold]",
        "  • Ask anything — coding, file tasks, web research, scheduling",
        "  • Destructive actions (delete, etc.) always ask for confirmation",
        "  • The assistant maintains context throughout the session",
    ]
    console.print(Panel("\n".join(lines), border_style="cyan"))


# ─── Main agent loop ──────────────────────────────────────────────────────────

def run_agent() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        console.print("[red bold]Error:[/red bold] ANTHROPIC_API_KEY is not set.")
        console.print("[dim]  Windows:  $env:ANTHROPIC_API_KEY = 'sk-ant-...'[/dim]")
        console.print("[dim]  Or add it to a .env file in this directory.[/dim]")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    conversation: list[dict] = []

    console.print(Panel(
        "[bold cyan]Personal AI Assistant[/bold cyan]\n"
        f"[dim]Model: {MODEL}  |  Type [cyan]/help[/cyan] for commands  |  [cyan]exit[/cyan] to quit[/dim]",
        border_style="cyan",
    ))
    console.print()

    while True:
        # ── Prompt ──
        try:
            user_input = Prompt.ask("[bold green]You[/bold green]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye.[/dim]")
            break

        if not user_input:
            continue

        # ── Built-ins ──
        if user_input.lower() in ("exit", "quit", "bye", "q"):
            console.print("[dim]Goodbye.[/dim]")
            break

        if user_input.lower() == "/clear":
            conversation.clear()
            console.print("[dim]Conversation cleared.[/dim]")
            continue

        if user_input.lower() == "/help":
            cmd_help()
            continue

        if user_input.lower() == "/calendar":
            cmd_calendar()
            continue

        if user_input.lower() == "/memory":
            cmd_memory()
            continue

        # ── Add user turn ──
        conversation.append({"role": "user", "content": user_input})

        # ── Agentic loop ──
        console.print()
        console.print("[bold blue]Assistant[/bold blue]")

        last_response = None
        while True:
            try:
                response = client.messages.create(
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                    tools=TOOLS,
                    messages=conversation,
                )
            except anthropic.APIStatusError as e:
                console.print(f"\n[red]API error {e.status_code}:[/red] {e.message}")
                conversation.pop()  # remove failed user turn
                break
            except anthropic.APIConnectionError:
                console.print("\n[red]Connection error — check your internet and try again.[/red]")
                conversation.pop()
                break

            last_response = response

            # Separate text blocks and tool calls
            text_parts = [b.text for b in response.content if b.type == "text"]
            tool_calls = [b for b in response.content if b.type == "tool_use"]

            if text_parts:
                show_response("\n".join(text_parts))

            # Done if no tool calls
            if not tool_calls:
                break

            # Add assistant turn (with tool calls) to history
            conversation.append({"role": "assistant", "content": response.content})

            # ── Execute tools ──
            tool_results = []
            for tc in tool_calls:
                needs_confirm = (
                    tc.name in _ALWAYS_CONFIRM
                    or (tc.name == "run_command" and tc.input.get("destructive"))
                )

                show_tool_call(tc.name, tc.input)

                if needs_confirm:
                    approved = ask_confirm(tc.name, tc.input)
                    if not approved:
                        result_str = json.dumps({"success": False, "error": "User declined this action."})
                        console.print("    [yellow]↩ skipped[/yellow]")
                    else:
                        result_str = dispatch(tc.name, tc.input)
                        _log_result(result_str)
                else:
                    result_str = dispatch(tc.name, tc.input)
                    _log_result(result_str)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": result_str,
                })

            conversation.append({"role": "user", "content": tool_results})
            console.print()
            console.print("[bold blue]Assistant[/bold blue]")


def _log_result(result_str: str) -> None:
    try:
        data = json.loads(result_str)
        if data.get("success") is False:
            console.print(f"    [red]✗ {data.get('error', 'failed')}[/red]")
        else:
            console.print("    [green]✓[/green]")
    except Exception:
        console.print("    [green]✓[/green]")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_agent()
