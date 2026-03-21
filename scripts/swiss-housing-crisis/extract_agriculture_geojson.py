#!/usr/bin/env python3
"""
Extract agricultural land use layers from per-canton Nutzungsflächen GeoPackages
into simplified GeoJSON files, split by animal vs plant agriculture.

Source: Landwirtschaftliche Nutzungsflächen (geodienste.ch)
  - Downloaded by download_nutzungsflaechen.py into downloads/
Input: downloads/*.gpkg (26 per-canton GeoPackages, EPSG:2056)
Output:
  - public/data/agriculture_animal_ch.geojson  (grassland, pastures, meadows → orange)
  - public/data/agriculture_plant_ch.geojson   (arable crops → yellow)

lnf_code classification:
  Animal agriculture (grassland/pasture):
    601  Kunstwiesen (temporary leys, sown grass)
    611  Extensiv genutzte Wiesen (extensive meadows)
    612  Wenig intensiv genutzte Wiesen (low-intensity meadows)
    613  Übrige Dauerwiesen (other permanent meadows)
    616  Weiden/Heimweiden (home pastures)
    617  Extensiv genutzte Weiden (extensive pastures)
    618  Waldweiden (forest pastures)
    635  Uferwiesen (riparian meadows)
    694  Regionsspezifische Biodiversitätsförderfläche (biodiversity grassland)
    930  Sömmerungsweiden (alpine summer pastures)

  Plant agriculture (arable/crops):
    All 500-series codes (wheat, barley, maize, potatoes, vegetables, etc.)
    725  Permakultur

Simplification: 100m tolerance (in LV95 / EPSG:2056 units = meters).
Polygons < 5000 m² are dropped to reduce output size.
"""

from pathlib import Path
import os
import geopandas as gpd
import pandas as pd

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "public" / "data"
DOWNLOAD_DIR = SCRIPT_DIR / "downloads"

SIMPLIFY_TOLERANCE = 0  # meters (0 = lossless, no simplification)
MIN_AREA = 0  # m² — keep all polygons (0 = lossless)

# lnf_code ranges for classification
ANIMAL_AG_CODES = {601, 611, 612, 613, 616, 617, 618, 635, 694, 930}
# Plant ag: 500–599 + 725
PLANT_AG_CODE_RANGE = range(500, 600)
PLANT_AG_EXTRA = {725}

EXTRACTIONS = [
    {
        "name": "animal agriculture (grassland/pasture)",
        "output": DATA_DIR / "agriculture_animal_ch.geojson",
        "filter": lambda code: code in ANIMAL_AG_CODES,
    },
    {
        "name": "plant agriculture (arable/crops)",
        "output": DATA_DIR / "agriculture_plant_ch.geojson",
        "filter": lambda code: code in PLANT_AG_CODE_RANGE or code in PLANT_AG_EXTRA,
    },
]


def load_all_cantons():
    """Load and concatenate all canton GeoPackages."""
    gpkg_files = sorted(DOWNLOAD_DIR.glob("**/*.gpkg"))
    if not gpkg_files:
        raise FileNotFoundError(
            f"No .gpkg files found in {DOWNLOAD_DIR}/. "
            "Run download_nutzungsflaechen.py first."
        )

    print(f"Loading {len(gpkg_files)} canton GeoPackages...")
    frames = []
    for gpkg in gpkg_files:
        canton = gpkg.stem.split("_")[4] if "_" in gpkg.stem else gpkg.stem
        # Read only the columns we need
        gdf = gpd.read_file(gpkg, columns=["lnf_code", "nutzung", "geometry"])
        print(f"  {canton}: {len(gdf)} features")
        frames.append(gdf)

    combined = pd.concat(frames, ignore_index=True)
    print(f"Total: {len(combined)} features across all cantons\n")
    return gpd.GeoDataFrame(combined, crs=frames[0].crs)


def extract_layer(gdf, name, output, filter_fn):
    """Filter, simplify, dissolve, and write a single layer."""
    print(f"[{name}]")

    mask = gdf["lnf_code"].apply(filter_fn)
    subset = gdf[mask].copy()
    print(f"  {len(subset)} features matched")

    if len(subset) == 0:
        print("  No features — skipping")
        return

    if SIMPLIFY_TOLERANCE > 0:
        print(f"  Simplifying (tolerance={SIMPLIFY_TOLERANCE}m)...")
        subset["geometry"] = subset["geometry"].simplify(SIMPLIFY_TOLERANCE)

    if MIN_AREA > 0:
        print(f"  Dropping polygons < {MIN_AREA} m²...")
        subset = subset[subset.geometry.area >= MIN_AREA]
        print(f"  {len(subset)} features remaining")

    # Fix invalid geometries before dissolve
    print("  Fixing invalid geometries...")
    subset["geometry"] = subset["geometry"].buffer(0)

    # Use a chunked approach: dissolve doesn't scale to 200k+ polygons at once
    print("  Dissolving (chunked, 10k features at a time)...")
    from shapely.ops import unary_union
    import numpy as np

    CHUNK_SIZE = 10_000
    geoms = subset.geometry.values
    chunks = [geoms[i : i + CHUNK_SIZE] for i in range(0, len(geoms), CHUNK_SIZE)]
    merged_chunks = []
    for i, chunk in enumerate(chunks):
        print(f"    chunk {i + 1}/{len(chunks)} ({len(chunk)} features)...")
        merged_chunks.append(unary_union(chunk))
    print("    merging chunks...")
    dissolved_geom = unary_union(merged_chunks)

    subset = gpd.GeoDataFrame(geometry=[dissolved_geom], crs=subset.crs)

    print("  Reprojecting to EPSG:4326...")
    subset = subset.to_crs(epsg=4326)

    subset = subset[["geometry"]]

    output.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Writing {output}...")
    subset.to_file(output, driver="GeoJSON", coordinate_precision=5)

    size_mb = os.path.getsize(output) / (1024 * 1024)
    print(f"  Done! {size_mb:.1f} MB\n")


def main():
    gdf = load_all_cantons()

    for extraction in EXTRACTIONS:
        extract_layer(
            gdf,
            extraction["name"],
            extraction["output"],
            extraction["filter"],
        )


if __name__ == "__main__":
    main()
