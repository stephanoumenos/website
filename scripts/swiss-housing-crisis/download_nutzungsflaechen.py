#!/usr/bin/env python3
"""
Download Landwirtschaftliche Nutzungsflächen GeoPackages for all 26 Swiss cantons.

Source: geodienste.ch (STAC API)
  - https://www.geodienste.ch/services/lwb_nutzungsflaechen
  - https://opendata.swiss/de/dataset/landwirtschaftliche-nutzungsflachen-schweiz

Downloads ~660 MB of per-canton GeoPackage ZIPs into downloads/ subfolder.
Skips cantons that have already been downloaded.

Usage:
    python download_nutzungsflaechen.py
"""

from pathlib import Path
import json
import urllib.request
import zipfile

SCRIPT_DIR = Path(__file__).parent
DOWNLOAD_DIR = SCRIPT_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

STAC_URL = "https://www.geodienste.ch/stac/collections/lwb_nutzungsflaechen/items?f=json&limit=50"


def get_canton_downloads():
    """Fetch all canton GeoPackage download URLs from STAC API."""
    req = urllib.request.Request(STAC_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())

    downloads = []
    for feature in data["features"]:
        canton = feature["id"].split("-")[-1]
        gpkg_asset = feature["assets"].get("geopackage_zip")
        if gpkg_asset:
            downloads.append(
                {
                    "canton": canton,
                    "url": gpkg_asset["href"],
                    "size_mb": gpkg_asset.get("file:size", 0) / (1024 * 1024),
                }
            )
    return sorted(downloads, key=lambda d: d["canton"])


def download_canton(canton, url, size_mb):
    """Download and extract a single canton's GeoPackage ZIP."""
    zip_path = DOWNLOAD_DIR / f"{canton}.zip"
    # ZIPs extract into a geopackage/ subfolder
    gpkg_files = list(DOWNLOAD_DIR.glob(f"**/*_{canton}_*.gpkg"))

    if gpkg_files:
        print(f"  [{canton}] Already extracted: {gpkg_files[0].name}, skipping")
        return gpkg_files[0]

    if zip_path.exists():
        print(f"  [{canton}] ZIP already downloaded, extracting...")
    else:
        print(f"  [{canton}] Downloading ({size_mb:.1f} MB)...")
        try:
            urllib.request.urlretrieve(url, zip_path)
        except urllib.error.HTTPError as e:
            print(f"  [{canton}] SKIPPED — HTTP {e.code} ({e.reason}). Requires registration?")
            zip_path.unlink(missing_ok=True)
            return None

    # Extract .gpkg file(s) from ZIP (they live inside a geopackage/ subfolder)
    with zipfile.ZipFile(zip_path) as zf:
        gpkg_names = [n for n in zf.namelist() if n.endswith(".gpkg")]
        for name in gpkg_names:
            zf.extract(name, DOWNLOAD_DIR)
            print(f"  [{canton}] Extracted: {name}")

    # Clean up ZIP
    zip_path.unlink()

    gpkg_files = list(DOWNLOAD_DIR.glob(f"**/*_{canton}_*.gpkg"))
    return gpkg_files[0] if gpkg_files else None


def main():
    print("Fetching canton download URLs from STAC API...")
    downloads = get_canton_downloads()
    total_mb = sum(d["size_mb"] for d in downloads)
    print(f"Found {len(downloads)} cantons, ~{total_mb:.0f} MB total\n")

    for d in downloads:
        download_canton(d["canton"], d["url"], d["size_mb"])

    print(f"\nDone! GeoPackages in {DOWNLOAD_DIR}/")


if __name__ == "__main__":
    main()
