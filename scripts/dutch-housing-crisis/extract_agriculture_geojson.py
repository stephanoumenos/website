#!/usr/bin/env python3
"""
Extract land-use layers from bbg2017.gpkg into simplified GeoJSON files.

Source: CBS Bestand Bodemgebruik 2017
  - https://www.pdok.nl/introductie/-/article/cbs-bestand-bodemgebruik-2017
Input: bbg2017.gpkg (~1.8GB GeoPackage)
Output:
  - public/data/agriculture_2017.geojson (farming + greenhouse horticulture)
  - public/data/urban_2017.geojson (residential areas)

Simplification: 100m tolerance (in RD New / EPSG:28992 units = meters).
"""

from pathlib import Path
import os
import geopandas as gpd

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "public" / "data"

INPUT = SCRIPT_DIR / "bbg2017.gpkg"
LAYER = "bestand_bodemgebruik_2017"
SIMPLIFY_TOLERANCE = 100  # meters (CRS is EPSG:28992)

EXTRACTIONS = [
    {
        "name": "agriculture",
        "output": DATA_DIR / "agriculture_2017.geojson",
        "column": "bodemgebruik",
        "values": ["Landbouw en overig agrarisch", "Glastuinbouw"],
    },
    {
        "name": "urban (residential)",
        "output": DATA_DIR / "urban_2017.geojson",
        "column": "categorie",
        "values": ["Woongebied"],
    },
]


def extract_layer(name, output, column, values):
    where = f"{column} IN ({', '.join(repr(v) for v in values)})"
    print(f"\n[{name}] Reading GeoPackage ({where})...")
    gdf = gpd.read_file(INPUT, layer=LAYER, where=where)
    print(f"  {len(gdf)} features loaded")

    print(f"  Simplifying (tolerance={SIMPLIFY_TOLERANCE}m)...")
    gdf["geometry"] = gdf["geometry"].simplify(SIMPLIFY_TOLERANCE)

    print("  Dissolving...")
    gdf = gdf.dissolve()

    print("  Reprojecting to EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)

    gdf = gdf[["geometry"]]

    print(f"  Writing {output}...")
    gdf.to_file(output, driver="GeoJSON", coordinate_precision=4)

    size_mb = os.path.getsize(output) / (1024 * 1024)
    print(f"  Done! {size_mb:.1f} MB")


for extraction in EXTRACTIONS:
    extract_layer(**extraction)
