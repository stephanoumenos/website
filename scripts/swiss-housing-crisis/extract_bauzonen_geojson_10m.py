#!/usr/bin/env python3
"""
Extract residential building zones from ch.are.bauzonen.gpkg into simplified GeoJSON.

Source: Bauzonen Schweiz (KGK-CGC), harmonized building zones 2022
  - https://www.kgk-cgc.ch/geodaten/geodaten-bauzonen-schweiz
Input: ch.are.bauzonen.gpkg (~436 MB GeoPackage, EPSG:2056)
Output:
  - public/data/bauzonen_residential_2022_10m.geojson (residential zones → green layer)

Zone categories (CH_CODE_HN):
  11: Wohnzonen (residential)           — 159,577 features
  12: Arbeitszonen (work/commercial)    —  20,158
  13: Mischzonen (mixed-use)            —  32,395
  14: Zentrumszonen (center/downtown)   —  79,815
  15: Zonen für öffentliche Nutzungen   —  36,516
  16: eingeschränkte Bauzonen           —  20,547
  17: Tourismus- und Freizeitzonen      —   3,054
  18: Verkehrszonen innerhalb Bauzonen  —  16,769
  19: weitere Bauzonen                  —   1,450

We extract codes 11, 13, 14 as the "residential" layer — zones where people live.

Simplification: 50m tolerance (in LV95 / EPSG:2056 units = meters).
"""

from pathlib import Path
import os
import geopandas as gpd

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "public" / "data"

INPUT = SCRIPT_DIR / "ch.are.bauzonen.gpkg"
LAYER = "ch.are.bauzonen"
SIMPLIFY_TOLERANCE = 10  # meters (0 = lossless, no simplification)

# Residential zones: Wohnzonen + Mischzonen + Zentrumszonen
RESIDENTIAL_CODES = [11, 13, 14]

EXTRACTIONS = [
    {
        "name": "residential (Bauzonen)",
        "output": DATA_DIR / "bauzonen_residential_2022_10m.geojson",
        "column": "CH_CODE_HN",
        "values": RESIDENTIAL_CODES,
    },
]


def extract_layer(name, output, column, values):
    where = f"{column} IN ({', '.join(str(v) for v in values)})"
    print(f"\n[{name}] Reading GeoPackage ({where})...")
    gdf = gpd.read_file(INPUT, layer=LAYER, where=where)
    print(f"  {len(gdf)} features loaded")

    if SIMPLIFY_TOLERANCE > 0:
        print(f"  Simplifying (tolerance={SIMPLIFY_TOLERANCE}m)...")
        gdf["geometry"] = gdf["geometry"].simplify(SIMPLIFY_TOLERANCE)

    print("  Fixing invalid geometries...")
    gdf["geometry"] = gdf["geometry"].buffer(0)

    print("  Dissolving...")
    gdf = gdf.dissolve()

    print("  Cleaning topology...")
    gdf["geometry"] = gdf["geometry"].buffer(0)

    print("  Reprojecting to EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)

    gdf = gdf[["geometry"]]

    output.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Writing {output}...")
    gdf.to_file(output, driver="GeoJSON", coordinate_precision=5)

    size_mb = os.path.getsize(output) / (1024 * 1024)
    print(f"  Done! {size_mb:.1f} MB")


for extraction in EXTRACTIONS:
    extract_layer(**extraction)
