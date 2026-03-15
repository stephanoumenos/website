# BBG 2017 GeoPackage Overview

The `bbg2017.gpkg` file is a large dataset containing the "Bestand Bodemgebruik" (BBG) from 2017, provided by the CBS (Centraal Bureau voor de Statistiek). It provides a comprehensive map of land usage in the Netherlands.

## File Information
- **File Name:** `bbg2017.gpkg`
- **File Size:** 1.8 GB
- **Format:** GeoPackage (SQLite-based)
- **Coordinate Reference System (SRS):** EPSG:28992 (RD New)

## Data Structure

### Main Table: `bestand_bodemgebruik_2017`
Contains ~171,543 features with the following columns:
- `fid`: Unique identifier
- `geom`: Multipolygon geometry (RD New)
- `bg2017`: Code for land use type
- `bodemgebruik`: High-level category (14 types)
- `categorie`: Detailed land use type (38 types)

### Mapping of Categories

| High-level (bodemgebruik) | Detailed (categorie) |
|---------------------------|----------------------|
| Bebouwd exclusief bedrijfsterrein | Woongebied, Detailhandel en horeca, Openbare voorziening, Sociaal-culturele voorziening |
| Bedrijfsterrein | Bedrijfsterrein |
| Bos | Bos |
| Droog natuurlijk terrein | Open droog natuurlijk terrein |
| Glastuinbouw | Glastuinbouw |
| Landbouw en overig agrarisch | Overig agrarisch terrein |
| Nat natuurlijk terrein | Open nat natuurlijk terrein |
| Recreatie | Park en plantsoen, Sportterrein, Volkstuin, Dagrecreatief terrein, Verblijfsrecreatief terrein |
| Semi-bebouwd | Stortplaats, Wrakkenopslagplaats, Begraafplaats, Delfstofwinplaats, Bouwterrein, Semi-verhard overig terrein |
| Spoorterrein | Spoorterrein |
| Vliegveld | Vliegveld |
| Water | IJsselmeer & Markermeer, Rijn & Maas, Oosterschelde, Westerschelde, etc. |

## Integration with Project

The `bbg2017.gpkg` file can be integrated into the project in several ways:

1. **Spatial Analysis & Scripts:**
   - The data can be queried using SQLite tools or spatial libraries (e.g., `gdal`, `geopandas`) via the existing `scripts/` directory.
   - It can be used as a baseline for comparing land use changes over time (e.g., comparing 2017 with newer datasets like `landbouwgebied_2025.geojson`).

2. **Data Extraction:**
   - Given its size (>1GB), it cannot be directly served to the frontend.
   - Specific areas or categories (e.g., "Glastuinbouw", "Overig agrarisch terrein") can be exported to smaller GeoJSON or Vector Tile formats for visualization in `AgriculturalMap.tsx`.

3. **Content Context:**
   - The land-use data provides empirical evidence for posts like `dutch-housing-crisis-animal-agriculture.mdx`. For instance, quantifying the exact area of "Landbouw en overig agrarisch" vs "Woongebied".

## Processing Recommendations

- **Do not load the entire file in the frontend.** Use server-side scripts to filter and extract relevant subsets.
- Use `sqlite3` or spatial CLI tools to perform queries efficiently without reading the entire 1.8GB into memory.
- For map visualization, consider generating MVT (Mapbox Vector Tiles) to allow performant exploration of the high-resolution geometry.
