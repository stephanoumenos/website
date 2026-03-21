# Swiss Housing Crisis — Data Pipeline

Scripts to download and process geospatial data for the Swiss land use map.

## Setup

```bash
cd scripts/swiss-housing-crisis
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Scripts

Run in order:

1. **`download_nutzungsflaechen.py`** — Downloads per-canton agricultural parcel GeoPackages from geodienste.ch via the STAC API. Skips already-downloaded cantons. Outputs to `downloads/geopackage/`.

2. **`extract_agriculture_geojson.py`** — Reads all downloaded cantons, classifies parcels by `lnf_code` into animal agriculture (grassland/pasture) vs plant agriculture (arable crops), simplifies, dissolves, and writes to `public/data/`.

3. **`extract_bauzonen_geojson.py`** — Extracts residential building zones from `ch.are.bauzonen.gpkg` (must be in this folder; extract from `bauzonen_are_2022_korrigiert.zip`). Writes to `public/data/`.

## Output files

| File | Size | Description |
|------|------|-------------|
| `public/data/agriculture_animal_ch.geojson` | ~10 MB | Grassland, meadows, pastures, alpine grazing (orange) |
| `public/data/agriculture_plant_ch.geojson` | ~0.6 MB | Arable crops: wheat, barley, maize, potatoes, etc. (yellow) |
| `public/data/bauzonen_residential_2022.geojson` | ~4.3 MB | Residential, mixed-use, center zones (green) |

## Missing cantons (require registration)

5 cantons return HTTP 401 from geodienste.ch and require manual registration at https://www.geodienste.ch/downloads/lwb_nutzungsflaechen to obtain access.

| Canton | Abbr | Registration URL |
|--------|------|-----------------|
| Neuchâtel | NE | https://www.geodienste.ch/downloads/lwb_nutzungsflaechen |
| Nidwalden | NW | https://www.geodienste.ch/downloads/lwb_nutzungsflaechen |
| Obwalden | OW | https://www.geodienste.ch/downloads/lwb_nutzungsflaechen |
| Ticino | TI | https://www.geodienste.ch/downloads/lwb_nutzungsflaechen |
| Vaud | VD | https://www.geodienste.ch/downloads/lwb_nutzungsflaechen |

### How to add missing cantons manually

1. Go to https://www.geodienste.ch/downloads/lwb_nutzungsflaechen
2. Register / request access for the canton
3. Download the GeoPackage ZIP
4. Place the extracted `.gpkg` file into `downloads/geopackage/`
5. Re-run `python extract_agriculture_geojson.py` — it will pick up all `.gpkg` files in that folder

Alternatively, the direct download URLs (once authenticated) follow this pattern:
```
https://www.geodienste.ch/downloads/geopackage/lwb_nutzungsflaechen/{CANTON}/deu/lwb_nutzungsflaechen_v3_0_{CANTON}_gpkg_lv95.zip
```
(Some cantons use `v2_0` instead of `v3_0`.)

## Mountain mask

The hillshade terrain layer is masked to only show in high-altitude areas (Bergzone III, IV, and Sömmerungsgebiet — roughly 1200m+). This prevents low-altitude hills from cluttering the map.

**Source**: Landwirtschaftliche Zonengrenzen (BLW)
- Download: https://data.geo.admin.ch/ch.blw.landwirtschaftliche-zonengrenzen/landwirtschaftliche-zonengrenzen/landwirtschaftliche-zonengrenzen_2056.gdb.zip
- opendata.swiss: https://opendata.swiss/en/dataset/landwirtschaftliche-zonengrenzen-der-schweiz

**How to regenerate `public/data/ch_mountain_mask.geojson`**:

```bash
source .venv/bin/activate
python3 -c "
import geopandas as gpd
import json
from shapely.ops import unary_union

gdf = gpd.read_file('path/to/NachF_LWZ.gdb', layer='LWZ')
mountain = gdf[gdf['LZCODE'].isin([53, 54, 61])]  # BZ III, IV, Sömmerungsgebiet
dissolved = unary_union(mountain.geometry).simplify(200)
result = gpd.GeoDataFrame(geometry=[dissolved], crs='EPSG:2056').to_crs('EPSG:4326')
geom = result.geometry[0].simplify(0.0005)

world = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]
holes = []
for poly in geom.geoms:
    coords = [[round(c[0], 3), round(c[1], 3)] for c in poly.exterior.coords]
    holes.append(coords[::-1])

mask = {'type': 'Feature', 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': [world] + holes}}
with open('../../public/data/ch_mountain_mask.geojson', 'w') as f:
    json.dump(mask, f)
"
```

**LZCODE reference**:
- 31 = Talzone (valley, ~200–600m)
- 41 = Hügelzone (hills, ~600–800m)
- 51 = Bergzone I (~800–1000m)
- 52 = Bergzone II (~1000–1200m)
- 53 = Bergzone III (~1200–1400m) ← included
- 54 = Bergzone IV (~1400–1600m) ← included
- 61 = Sömmerungsgebiet (~1600m+) ← included

## Data sources

- **Bauzonen Schweiz** (KGK-CGC): https://opendata.swiss/en/dataset/bauzonen-schweiz-harmonisiert
- **Landwirtschaftliche Nutzungsflächen**: https://opendata.swiss/de/dataset/landwirtschaftliche-nutzungsflachen-schweiz
- **Landwirtschaftliche Zonengrenzen** (BLW): https://opendata.swiss/en/dataset/landwirtschaftliche-zonengrenzen-der-schweiz
- STAC catalog: https://www.geodienste.ch/stac/collections/lwb_nutzungsflaechen

## lnf_code classification

Animal agriculture (grassland/pasture):
- 601: Kunstwiesen (temporary leys)
- 611: Extensiv genutzte Wiesen (extensive meadows)
- 612: Wenig intensiv genutzte Wiesen (low-intensity meadows)
- 613: Übrige Dauerwiesen (permanent meadows)
- 616: Weiden/Heimweiden (home pastures)
- 617: Extensiv genutzte Weiden (extensive pastures)
- 618: Waldweiden (forest pastures)
- 635: Uferwiesen (riparian meadows)
- 694: Biodiversitätsförderfläche (biodiversity grassland)
- 930: Sömmerungsweiden (alpine summer pastures)

Plant agriculture (arable/crops):
- 500–599: All arable codes (wheat, barley, maize, potatoes, vegetables, etc.)
- 725: Permakultur
