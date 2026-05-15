#!/usr/bin/env python3
"""Discount Code Finder — Flask web app to find coupon/promo codes for any store."""

import json
import os
import re

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
import httpx

load_dotenv()

app = Flask(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Words that look like codes but aren't
_EXCLUDE = {
    "HTML", "HTTP", "HTTPS", "POST", "JSON", "REST", "AJAX", "CORS", "CSRF",
    "USD", "USA", "FAQ", "PDF", "URL", "SEO", "CSS", "PHP", "SQL", "CDN",
    "SAVE", "SALE", "DEAL", "SHOP", "COPY", "SHOW", "VIEW", "HIDE", "NEXT",
    "MORE", "BEST", "LAST", "BACK", "HERE", "THIS", "THAT", "PLUS", "LESS",
    "CART", "ITEM", "USER", "SITE", "PAGE", "LINK", "TEXT", "LIST", "FORM",
    "PROMO", "OFFER", "TODAY", "ORDER", "TOTAL", "APPLY", "ENTER", "VALID",
    "TERMS", "CHECK", "EMAIL", "PHONE", "STORE", "PRICE", "BRAND", "CLICK",
    "FROM", "HAVE", "WILL", "WITH", "BEEN", "WERE", "THEY", "THEM", "SOME",
    "INTO", "OVER", "SUCH", "SAME", "THAN", "ONLY", "MOST", "ALSO", "WHEN",
    "WHAT", "THEN", "FREE", "GET", "BUY", "FOR", "NEW", "NOW", "OFF", "TOP",
    "ABOUT", "ABOVE", "AFTER", "AGAIN", "EVERY", "FIRST", "FOUND", "GREAT",
    "LARGE", "LATER", "MIGHT", "NEVER", "NIGHT", "OTHER", "PLACE", "RIGHT",
    "SMALL", "STILL", "THESE", "THINK", "THREE", "UNDER", "UNTIL", "WHILE",
    "WHERE", "WHICH", "WHOSE", "WORLD", "WOULD", "WRITE", "YEARS", "YOUNG",
    "EXTRA", "BONUS", "FLASH", "LIMIT", "SPEND", "SPEND", "ENJOY", "PERKS",
    "DEALS", "CODES", "COUPON", "COUPONS", "DISCOUNTS", "DISCOUNT",
}


# ── Code extraction ────────────────────────────────────────────────────────────

def _is_valid_code(code: str) -> bool:
    """Return True if the string looks like a real coupon code."""
    if len(code) < 4 or len(code) > 22:
        return False
    if code in _EXCLUDE:
        return False
    # Must have both letters and digits, OR be 6+ pure alpha (word-like codes)
    has_digit = any(c.isdigit() for c in code)
    has_alpha = any(c.isalpha() for c in code)
    if has_digit and has_alpha:
        return True
    if has_alpha and len(code) >= 6 and code.isalpha():
        return True
    return False


def extract_codes(text: str) -> list[str]:
    """Extract coupon codes from raw text."""
    upper = text.upper()
    found, seen = [], set()

    # High-confidence: "use code XXXX", "promo: XXXX", etc.
    explicit = re.findall(
        r"(?:USE|ENTER|APPLY|PROMO|COUPON|CODE)[:\s]+(?:CODE\s+)?['\"]?([A-Z][A-Z0-9]{3,21})['\"]?",
        upper,
    )
    for code in explicit:
        if _is_valid_code(code) and code not in seen:
            found.append(code)
            seen.add(code)

    # Medium-confidence: bare uppercase alphanumeric tokens
    for code in re.findall(r"\b([A-Z][A-Z0-9]{3,21})\b", upper):
        if _is_valid_code(code) and code not in seen:
            found.append(code)
            seen.add(code)

    return found


# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _fetch(url: str, timeout: int = 8):
    """GET a URL; return (soup, text) or (None, None) on failure."""
    try:
        with httpx.Client(headers=HEADERS, timeout=timeout, follow_redirects=True) as c:
            r = c.get(url)
            if r.status_code == 200:
                return BeautifulSoup(r.text, "html.parser"), r.text
    except Exception:
        pass
    return None, None


def _extract_nextjs_coupons(soup: BeautifulSoup) -> list[dict]:
    """Pull coupon data out of Next.js __NEXT_DATA__ JSON blobs."""
    script = soup.find("script", id="__NEXT_DATA__")
    if not script or not script.string:
        return []
    try:
        return _walk_json(json.loads(script.string))
    except Exception:
        return []


def _walk_json(obj, depth: int = 0) -> list[dict]:
    """Recursively hunt for {code, title/description} objects in JSON."""
    if depth > 8:
        return []
    results = []
    if isinstance(obj, dict):
        code = obj.get("code") or obj.get("couponCode") or obj.get("promoCode")
        if isinstance(code, str) and 2 <= len(code) <= 25:
            results.append({
                "code": code.upper(),
                "description": (
                    obj.get("title") or obj.get("description") or obj.get("name") or ""
                )[:120],
            })
        for v in obj.values():
            results.extend(_walk_json(v, depth + 1))
    elif isinstance(obj, list):
        for item in obj:
            results.extend(_walk_json(item, depth + 1))
    return results


# ── Scrapers ───────────────────────────────────────────────────────────────────

def _scrape_generic_page(url: str, store_name: str, source_label: str) -> list[dict]:
    """Generic scraper: data-code attrs + code-class elements + __NEXT_DATA__."""
    soup, _ = _fetch(url)
    if not soup:
        return []

    results, seen = [], set()

    def add(code, desc=""):
        code = code.strip().upper()
        if code and code not in seen and 2 <= len(code) <= 25:
            results.append({"code": code, "description": desc[:120] or f"Discount for {store_name}", "source": source_label})
            seen.add(code)

    # Next.js data blobs
    for item in _extract_nextjs_coupons(soup):
        add(item["code"], item["description"])

    # data-code / data-clipboard-text attributes
    for el in soup.find_all(attrs={"data-code": True}):
        parent = el.find_parent(["article", "li", "section"])
        desc = ""
        if parent:
            title = parent.find(["h2", "h3", "h4", "p"])
            if title:
                desc = title.get_text(" ", strip=True)
        add(el["data-code"], desc)

    for el in soup.find_all(attrs={"data-clipboard-text": True}):
        add(el["data-clipboard-text"])

    # Elements whose class name contains "code"
    for el in soup.find_all(class_=lambda c: c and "code" in " ".join(c).lower()):
        text = el.get_text(strip=True)
        if re.match(r"^[A-Z0-9]{3,25}$", text.upper()):
            add(text)

    return results


def _scrape_couponfollow(store_name: str, domain: str) -> list[dict]:
    slug = re.sub(r"[^a-z0-9-]", "-", store_name.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    urls = []
    if domain:
        urls.append(f"https://couponfollow.com/site/{domain}")
    urls.append(f"https://couponfollow.com/site/{slug}.com")

    for url in urls:
        r = _scrape_generic_page(url, store_name, "CouponFollow")
        if r:
            return r
    return []


def _scrape_wethrift(store_name: str, domain: str) -> list[dict]:
    slug = re.sub(r"[^a-z0-9-]", "-", store_name.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    d_slug = domain.split(".")[0] if domain else slug
    urls = {f"https://www.wethrift.com/{slug}", f"https://www.wethrift.com/{d_slug}"}

    for url in urls:
        r = _scrape_generic_page(url, store_name, "Wethrift")
        if r:
            return r
    return []


# ── DuckDuckGo search ──────────────────────────────────────────────────────────

def _ddgs_search(store_name: str) -> list[dict]:
    """Search DuckDuckGo and extract codes from result snippets."""
    try:
        for mod_name in ("ddgs", "duckduckgo_search"):
            try:
                mod = __import__(mod_name, fromlist=["DDGS"])
                DDGS = mod.DDGS
                break
            except ImportError:
                continue
        else:
            return []

        queries = [
            f"{store_name} coupon code promo code 2025",
            f'"{store_name}" discount code site:retailmenot.com OR site:couponfollow.com OR site:wethrift.com',
        ]

        raw_results = []
        with DDGS() as ddgs:
            for q in queries:
                raw_results.extend(ddgs.text(q, max_results=8))

        found, seen = [], set()
        KNOWN_SOURCES = {
            "retailmenot": "RetailMeNot",
            "coupons.com": "Coupons.com",
            "couponfollow": "CouponFollow",
            "wethrift": "Wethrift",
            "slickdeals": "SlickDeals",
            "groupon": "Groupon",
            "honey": "Honey",
            "dealspotr": "DealsPotr",
        }

        for r in raw_results:
            text = f"{r.get('title', '')} {r.get('body', '')}"
            codes = extract_codes(text)
            url = r.get("href", "")
            source = next((v for k, v in KNOWN_SOURCES.items() if k in url), "Web Search")
            title = r.get("title", f"Discount code for {store_name}")

            for code in codes[:3]:
                if code not in seen:
                    found.append({"code": code, "description": title[:120], "source": source, "url": url})
                    seen.add(code)

        return found

    except Exception as e:
        print(f"DuckDuckGo search error: {e}")
        return []


# ── Route handlers ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/search", methods=["POST"])
def api_search():
    data = request.get_json(silent=True) or {}
    store_input = data.get("store", "").strip()

    if not store_input:
        return jsonify({"error": "Please enter a store name or website URL"}), 400
    if len(store_input) > 120:
        return jsonify({"error": "Store name too long"}), 400

    # Normalise: "amazon.com" → domain=amazon.com, name=Amazon
    if re.match(r"^[\w.-]+\.\w{2,}$", store_input) and " " not in store_input:
        domain = store_input.lower().lstrip("www.")
        store_name = domain.split(".")[0].replace("-", " ").title()
    else:
        store_name = store_input.title()
        domain = re.sub(r"[^a-z0-9-]", "", store_name.lower().replace(" ", "")) + ".com"

    all_codes: list[dict] = []
    seen_codes: set[str] = set()

    def add_codes(items: list[dict]):
        for item in items:
            code = item.get("code", "").strip().upper()
            if code and code not in seen_codes and _is_valid_code(code):
                all_codes.append(item)
                seen_codes.add(code)

    # Run all strategies
    add_codes(_ddgs_search(store_name))
    add_codes(_scrape_couponfollow(store_name, domain))
    add_codes(_scrape_wethrift(store_name, domain))

    return jsonify({
        "store": store_name,
        "domain": domain,
        "codes": all_codes[:20],
        "count": len(all_codes),
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5050))
    print(f"\n  Discount Finder → http://localhost:{port}\n")
    app.run(debug=True, port=port, host="0.0.0.0")
