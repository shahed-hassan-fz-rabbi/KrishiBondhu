"""Fetch the newest open Bangladesh RTFP archive listed by the World Bank."""
from __future__ import annotations

import argparse
import json
import re
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse


INDEX_URL = "https://microdata.worldbank.org/api/downloads/BGD_2021_RTFP_v02_M/files?type=data"
FILENAME_RE = re.compile(r"^BGD_RTFP_mkt_2007_(\d{4}-\d{2}-\d{2})\.zip$")
MAX_INDEX_BYTES = 4 * 1024 * 1024
MAX_DATA_BYTES = 64 * 1024 * 1024


def _request(url: str, max_bytes: int) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "microdata.worldbank.org":
        raise ValueError("Refusing a non-World Bank HTTPS URL")
    request = urllib.request.Request(url, headers={"User-Agent": "KrishiBondhu-MarketData/1.0", "Accept": "application/json, application/zip"})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValueError("World Bank response exceeded the configured size limit")
    return payload


def fetch_latest(raw_dir: Path) -> dict[str, object]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    index_bytes = _request(INDEX_URL, MAX_INDEX_BYTES)
    index = json.loads(index_bytes.decode("utf-8"))
    candidates = []
    for item in index.get("files", []):
        filename = str(item.get("filename", ""))
        match = FILENAME_RE.match(filename)
        link = str((item.get("links") or {}).get("download", ""))
        if not match or item.get("data_access_type") != "open" or item.get("external_link"):
            continue
        parsed = urlparse(link)
        if parsed.scheme == "https" and parsed.hostname == "microdata.worldbank.org":
            candidates.append((match.group(1), filename, link))
    if not candidates:
        raise ValueError("No open Bangladesh monthly market-price archive was listed by the World Bank")
    version, filename, download_url = max(candidates, key=lambda row: row[0])
    index_path = raw_dir / "worldbank-downloads-index.json"
    index_path.write_bytes(index_bytes)
    destination = raw_dir / filename
    if destination.exists():
        try:
            with zipfile.ZipFile(destination) as archive:
                if archive.testzip() is None and any(Path(item).name == f"BGD_RTFP_mkt_2007_{version}.csv" for item in archive.namelist()):
                    return {"updated": False, "version": version, "file": filename, "reason": "already_downloaded"}
        except zipfile.BadZipFile:
            pass
    payload = _request(download_url, MAX_DATA_BYTES)
    with tempfile.NamedTemporaryFile(prefix="worldbank-rtfp-", suffix=".zip", dir=raw_dir, delete=False) as temp:
        temp_path = Path(temp.name)
        temp.write(payload)
    try:
        with zipfile.ZipFile(temp_path) as archive:
            if archive.testzip() is not None:
                raise ValueError("Downloaded World Bank ZIP failed its CRC check")
            if not any(Path(item).name == f"BGD_RTFP_mkt_2007_{version}.csv" for item in archive.namelist()):
                raise ValueError("Downloaded ZIP does not contain the CSV matching its version")
        temp_path.replace(destination)
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return {"updated": True, "version": version, "file": filename, "bytes": len(payload)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path(__file__).parent / "data/raw")
    args = parser.parse_args()
    print(json.dumps(fetch_latest(args.raw_dir)))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError, zipfile.BadZipFile) as error:
        raise SystemExit(f"World Bank market refresh failed: {error}") from error
