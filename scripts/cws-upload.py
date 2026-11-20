#!/usr/bin/env python3
"""Upload packages/tapeline-<version>-chrome.zip to the Chrome Web Store.

No item id in store/cws-item-id.txt: creates a new draft item (API v1.1) and saves its id.
With an id: uploads a new package to that item. Publishing needs the listing (screenshots,
category, privacy answers) filled in the developer dashboard first; pass --publish after that.
Credentials: CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN from the studio .env (never printed).
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = dict(l.split("=", 1) for l in (ROOT.parent.parent / ".env").read_text().splitlines() if "=" in l)
ID_FILE = ROOT / "store" / "cws-item-id.txt"


def token():
    data = urllib.parse.urlencode(dict(client_id=ENV["CWS_CLIENT_ID"], client_secret=ENV["CWS_CLIENT_SECRET"],
                                       refresh_token=ENV["CWS_REFRESH_TOKEN"], grant_type="refresh_token")).encode()
    for attempt in range(4):  # the token endpoint sometimes answers 503
        try:
            return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data))["access_token"]
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def call(method, url, body=None, ctype=None):
    headers = {"Authorization": f"Bearer {token()}", "x-goog-api-version": "2"}
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw[:500].decode(errors="replace")


def main():
    version = json.loads((ROOT / "extension/manifest.json").read_text())["version"]
    item = ID_FILE.read_text().strip() if ID_FILE.exists() else None
    if "--status" in sys.argv and item:
        print(call("GET", f"https://www.googleapis.com/chromewebstore/v1.1/items/{item}?projection=DRAFT"))
        return
    if "--publish" in sys.argv and item:
        print(call("POST", f"https://www.googleapis.com/chromewebstore/v1.1/items/{item}/publish", b"", "application/json"))
        return
    # Only an upload needs the package (node scripts/pack-extension.mjs builds it).
    zip_bytes = (ROOT / "packages" / f"tapeline-{version}-chrome.zip").read_bytes()
    if item:
        url = f"https://www.googleapis.com/upload/chromewebstore/v1.1/items/{item}?uploadType=media"
        code, res = call("PUT", url, zip_bytes, "application/zip")
    else:
        url = "https://www.googleapis.com/upload/chromewebstore/v1.1/items?uploadType=media"
        code, res = call("POST", url, zip_bytes, "application/zip")
    print(code, json.dumps(res)[:1000])
    if code < 300 and isinstance(res, dict) and res.get("id") and not item:
        ID_FILE.parent.mkdir(exist_ok=True)
        ID_FILE.write_text(res["id"] + "\n")
        print("saved item id to", ID_FILE.relative_to(ROOT))


if __name__ == "__main__":
    main()
