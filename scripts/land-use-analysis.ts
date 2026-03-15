/**
 * Land Use Analysis for the Netherlands
 *
 * Combines three CBS (Centraal Bureau voor de Statistiek) datasets to show how
 * Dutch land is divided between animal agriculture, other farming, housing,
 * and everything else.
 *
 * Data sources:
 *   1. CBS Land Use survey (Bodemgebruik), 2017 — general land use categories
 *      https://opendata.cbs.nl/#/CBS/en/dataset/70262ENG/table
 *
 *   2. CBS Agricultural census (Landbouwtelling), 2023 — farm type breakdown
 *      https://opendata.cbs.nl/#/CBS/en/dataset/80783ENG/table
 *
 *   3. CBS Arable crops production, 2023 — crop areas by type
 *      https://opendata.cbs.nl/#/CBS/en/dataset/7100eng/table
 *
 * Methodology:
 *   - Water surfaces (inland water + tidal water) are excluded from the total,
 *     because counting sea and lake area alongside residential land would be
 *     misleading — you can't build housing on the IJsselmeer.
 *   - The CBS land use survey reports total agricultural land as a single figure.
 *     To split it into animal farming, livestock feed, and other farming, we use
 *     the CBS agricultural census which breaks down land use by farm type.
 *   - The share of arable cropland used for livestock feed is calculated from
 *     CBS crop area data, classifying each crop by its primary use (feed, food,
 *     or industrial). This replaces a previous hardcoded 60% estimate.
 *   - The farm type census covers slightly less land than the land use survey
 *     (different methodology, different year). We scale the farm type proportions
 *     to match the land use survey's total agricultural area.
 *   - "Non-residential built-up" combines CBS categories "Built-up area" (minus
 *     residential) and "Semi built-up area" (building sites, industrial, etc.).
 *
 * Usage:
 *   npx tsx scripts/land-use-analysis.ts
 *   npx tsx scripts/land-use-analysis.ts --json
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. Parse CBS land use CSV
// ---------------------------------------------------------------------------

interface LandUseRow {
  region: string;
  period: string;
  totalSurface: number;
  transport: number;
  builtUpTotal: number;
  residential: number;
  semiBuiltUpTotal: number;
  recreation: number;
  agricultureTotal: number;
  woodlandAndNature: number;
  inlandWater: number;
  tidalWater: number;
}

function parseLandUseCsv(filePath: string): LandUseRow[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw
    .replace(/^\uFEFF/, "") // strip BOM
    .split("\n")
    .filter((l) => l.trim());

  const header = lines[0];
  const colNames = header.split(";").map((c) => c.replace(/^"|"$/g, "").trim());

  const col = (name: string) => {
    const idx = colNames.findIndex((c) => c === name);
    if (idx === -1) throw new Error(`Column not found: ${name}`);
    return idx;
  };

  const rows: LandUseRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(";").map((f) => f.replace(/^"|"$/g, "").trim());
    const num = (idx: number) => {
      const v = fields[idx];
      if (!v || v === "") return 0;
      return parseInt(v, 10);
    };

    rows.push({
      region: fields[col("Regions")],
      period: fields[col("Periods")],
      totalSurface: num(col("Total surface (ha)")),
      transport: num(col("Transport/Transport total (ha)")),
      builtUpTotal: num(col("Built-up area/Built-up area total (ha)")),
      residential: num(col("Built-up area/Residential (ha)")),
      semiBuiltUpTotal: num(col("Semi built-up area/Semi built-up area total (ha)")),
      recreation: num(col("Recreation/Recreation total (ha)")),
      agricultureTotal: num(col("Agriculture/Agriculture total (ha)")),
      woodlandAndNature: num(col("Woodland and nature/Woodland and nature total (ha)")),
      inlandWater: num(col("Inland water/Inland water total (ha)")),
      tidalWater: num(col("Tidal water/Tidal water total (ha)")),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 2. CBS Agricultural census data (farm type breakdown)
// ---------------------------------------------------------------------------
// Source: CBS StatLine — Agriculture; crops, livestock and land use by farm type
// https://opendata.cbs.nl/#/CBS/en/dataset/80783ENG/table
// Period: 2023 | Region: Nederland | Measure: Land use, total (are)
//
// 1 are = 100 m² = 0.01 ha

interface FarmType {
  name: string;
  totalLandAre: number;
  category: "animal" | "crop";
}

const farmTypes: FarmType[] = [
  { name: "Specialist grazing livestock", totalLandAre: 115_144_673, category: "animal" },
  { name: "Specialist granivores", totalLandAre: 5_391_386, category: "animal" },
  { name: "Specialist mixed livestock", totalLandAre: 1_789_467, category: "animal" },
  { name: "Specialist mixed crops/livestock", totalLandAre: 7_591_433, category: "animal" },
  { name: "Specialist field crops", totalLandAre: 51_846_951, category: "crop" },
  { name: "Specialist horticulture", totalLandAre: 10_640_095, category: "crop" },
  { name: "Specialist permanent crops", totalLandAre: 2_198_684, category: "crop" },
  { name: "Specialist mixed cropping", totalLandAre: 6_618_459, category: "crop" },
];

// ---------------------------------------------------------------------------
// 3. CBS Arable crops data (crop type breakdown)
// ---------------------------------------------------------------------------
// Source: CBS StatLine — Arable crops; production
// https://opendata.cbs.nl/#/CBS/en/dataset/7100eng/table
// Period: 2023 | Region: Nederland

interface CropRow {
  name: string;
  period: string;
  areaHa: number;
}

function parseCropsCsv(filePath: string): CropRow[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split("\n")
    .filter((l) => l.trim());

  const rows: CropRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(";").map((f) => f.replace(/^"|"$/g, "").trim());
    const area = fields[3]; // "Area under cultivation (ha)"
    if (!area || area === "" || area === ".") continue;
    rows.push({
      name: fields[0],
      period: fields[1].replace("*", ""),
      areaHa: parseInt(area, 10),
    });
  }
  return rows;
}

// Each top-level crop and the share of its area that goes to animal feed.
// Only top-level categories are used to avoid double-counting subcategories.
// "Linseed" is excluded — CBS reports the same area as "Fibre flax" (same crop,
// two products).
const cropFeedShares: Record<string, { feedShare: number; use: "feed" | "food" | "industrial" | "mixed" }> = {
  // 100% animal feed
  "Green maize":          { feedShare: 1.0, use: "feed" },        // Silage maize — exclusively cattle feed
  "Maize, corn cob mix":  { feedShare: 1.0, use: "feed" },        // Pig and poultry feed
  "Grain maize":          { feedShare: 1.0, use: "feed" },        // Feed grain in NL
  "Triticale":            { feedShare: 1.0, use: "feed" },        // Wheat-rye hybrid, almost entirely feed

  // Cereals — mixed use (feed + food + industrial)
  "Wheat (total)":        { feedShare: 0.35, use: "mixed" },      // ~35% to animal feed in NL
  "Barley, winter":       { feedShare: 0.70, use: "mixed" },      // Mostly feed barley
  "Barley, spring":       { feedShare: 0.70, use: "mixed" },      // Mostly feed, some malting
  "Rye":                  { feedShare: 0.50, use: "mixed" },
  "Oats":                 { feedShare: 0.50, use: "mixed" },

  // Food crops
  "Potatoes (total)":     { feedShare: 0.0, use: "food" },
  "Sugar beet":           { feedShare: 0.0, use: "food" },        // Primary product is sugar
  "Seed onions (total)":  { feedShare: 0.0, use: "food" },
  "Onion sets (2nd year)":{ feedShare: 0.0, use: "food" },
  "Kidney beans":         { feedShare: 0.0, use: "food" },
  "Chicory":              { feedShare: 0.0, use: "food" },

  // Industrial crops
  "Turnip rape (total)":  { feedShare: 0.0, use: "industrial" },  // Oil / biofuel
  "Fibre flax":           { feedShare: 0.0, use: "industrial" },
  "Hemp":                 { feedShare: 0.0, use: "industrial" },
};

interface CropBreakdown {
  feedShareOfFieldCrops: number;
  totalAreaHa: number;
  feedAreaHa: number;
  foodAreaHa: number;
  industrialAreaHa: number;
  crops: { name: string; areaHa: number; feedAreaHa: number; use: string }[];
}

function calculateCropBreakdown(allCrops: CropRow[], year: string): CropBreakdown {
  const yearCrops = allCrops.filter((c) => c.period === year);

  let totalAreaHa = 0;
  let feedAreaHa = 0;
  let foodAreaHa = 0;
  let industrialAreaHa = 0;
  const crops: CropBreakdown["crops"] = [];

  for (const [cropName, { feedShare, use }] of Object.entries(cropFeedShares)) {
    const crop = yearCrops.find((c) => c.name === cropName);
    if (!crop) continue;

    const feedArea = crop.areaHa * feedShare;
    const nonFeedArea = crop.areaHa - feedArea;

    totalAreaHa += crop.areaHa;
    feedAreaHa += feedArea;
    if (use === "food" || use === "mixed") foodAreaHa += nonFeedArea;
    if (use === "industrial") industrialAreaHa += nonFeedArea;

    crops.push({ name: cropName, areaHa: crop.areaHa, feedAreaHa: feedArea, use });
  }

  crops.sort((a, b) => b.areaHa - a.areaHa);

  return {
    feedShareOfFieldCrops: feedAreaHa / totalAreaHa,
    totalAreaHa,
    feedAreaHa,
    foodAreaHa,
    industrialAreaHa,
    crops,
  };
}

// ---------------------------------------------------------------------------
// 4. Land use analysis
// ---------------------------------------------------------------------------

interface LandCategory {
  label: string;
  areaHa: number;
  areaKm2: number;
  share: number; // 0–1
}

function analyse(landUse: LandUseRow, feedShareOfFieldCrops: number): LandCategory[] {
  // Exclude water — you can't build homes on the North Sea
  const landOnly =
    landUse.totalSurface - landUse.inlandWater - landUse.tidalWater;

  // --- Split agriculture using farm type proportions ---
  const animalFarmingAre = farmTypes
    .filter((f) => f.category === "animal")
    .reduce((sum, f) => sum + f.totalLandAre, 0);

  const fieldCropsAre = farmTypes.find(
    (f) => f.name === "Specialist field crops"
  )!.totalLandAre;
  const livestockFeedAre = fieldCropsAre * feedShareOfFieldCrops;

  const otherFarmingAre =
    farmTypes
      .filter((f) => f.category === "crop")
      .reduce((sum, f) => sum + f.totalLandAre, 0) - livestockFeedAre;

  const totalFarmCensusAre = animalFarmingAre + livestockFeedAre + otherFarmingAre;
  const totalFarmCensusHa = totalFarmCensusAre / 100;

  // Scale proportions to match the land use survey's agriculture total
  const scale = landUse.agricultureTotal / totalFarmCensusHa;
  const animalFarmingHa = (animalFarmingAre / 100) * scale;
  const livestockFeedHa = (livestockFeedAre / 100) * scale;
  const otherFarmingHa = (otherFarmingAre / 100) * scale;

  // Non-residential built-up = built-up (minus residential) + semi built-up
  const nonResidentialHa =
    landUse.builtUpTotal - landUse.residential + landUse.semiBuiltUpTotal;

  const categories: LandCategory[] = [
    { label: "Animal farming", areaHa: animalFarmingHa },
    { label: "Woodland and nature", areaHa: landUse.woodlandAndNature },
    { label: "Other farming", areaHa: otherFarmingHa },
    { label: "Livestock feed", areaHa: livestockFeedHa },
    { label: "Residential", areaHa: landUse.residential },
    { label: "Non-residential built-up", areaHa: nonResidentialHa },
    { label: "Transport", areaHa: landUse.transport },
    { label: "Recreation", areaHa: landUse.recreation },
  ].map((c) => ({
    ...c,
    areaKm2: Math.round(c.areaHa / 100),
    share: c.areaHa / landOnly,
  }));

  // Sort by area descending
  categories.sort((a, b) => b.areaHa - a.areaHa);

  return categories;
}

// ---------------------------------------------------------------------------
// 5. Output
// ---------------------------------------------------------------------------

function printTable(categories: LandCategory[]) {
  console.log("\nLand use in the Netherlands (excluding water surfaces)\n");
  console.log(
    "Category".padEnd(28) +
      "Area (km²)".padStart(12) +
      "Share".padStart(8)
  );
  console.log("-".repeat(48));

  let totalKm2 = 0;
  for (const c of categories) {
    totalKm2 += c.areaKm2;
    console.log(
      c.label.padEnd(28) +
        c.areaKm2.toLocaleString("en-US").padStart(12) +
        (c.share * 100).toFixed(1).padStart(7) +
        "%"
    );
  }

  console.log("-".repeat(48));
  console.log("Total".padEnd(28) + totalKm2.toLocaleString("en-US").padStart(12));

  const animalTotal = categories
    .filter((c) => c.label === "Animal farming" || c.label === "Livestock feed")
    .reduce((s, c) => s + c.share, 0);
  const residential = categories.find((c) => c.label === "Residential")!.share;

  console.log(
    `\nAnimal agriculture (farming + feed): ${(animalTotal * 100).toFixed(1)}%`
  );
  console.log(`Residential: ${(residential * 100).toFixed(1)}%`);
  console.log(`Ratio: ${(animalTotal / residential).toFixed(1)}x`);
}

function printCropBreakdown(breakdown: CropBreakdown) {
  console.log("\n\nArable crop breakdown (2023)\n");
  console.log(
    "Crop".padEnd(28) +
      "Area (ha)".padStart(12) +
      "Feed (ha)".padStart(12) +
      "Use".padStart(12)
  );
  console.log("-".repeat(64));

  for (const c of breakdown.crops) {
    console.log(
      c.name.padEnd(28) +
        c.areaHa.toLocaleString("en-US").padStart(12) +
        Math.round(c.feedAreaHa).toLocaleString("en-US").padStart(12) +
        c.use.padStart(12)
    );
  }

  console.log("-".repeat(64));
  console.log(
    "Total".padEnd(28) +
      breakdown.totalAreaHa.toLocaleString("en-US").padStart(12) +
      Math.round(breakdown.feedAreaHa).toLocaleString("en-US").padStart(12)
  );
  console.log(
    `\nFeed share of arable cropland: ${(breakdown.feedShareOfFieldCrops * 100).toFixed(1)}%`
  );
  console.log(
    `Food: ${Math.round(breakdown.foodAreaHa).toLocaleString("en-US")} ha` +
      `  |  Feed: ${Math.round(breakdown.feedAreaHa).toLocaleString("en-US")} ha` +
      `  |  Industrial: ${Math.round(breakdown.industrialAreaHa).toLocaleString("en-US")} ha`
  );
}

function printJson(categories: LandCategory[], breakdown: CropBreakdown) {
  const output = {
    landUse: categories.map((c) => ({
      label: c.label,
      area_km2: c.areaKm2,
      share_pct: parseFloat((c.share * 100).toFixed(1)),
    })),
    arableCrops: {
      feed_share_pct: parseFloat((breakdown.feedShareOfFieldCrops * 100).toFixed(1)),
      total_area_ha: breakdown.totalAreaHa,
      feed_area_ha: breakdown.feedAreaHa,
      food_area_ha: breakdown.foodAreaHa,
      industrial_area_ha: breakdown.industrialAreaHa,
      crops: breakdown.crops.map((c) => ({
        name: c.name,
        area_ha: c.areaHa,
        feed_area_ha: c.feedAreaHa,
        use: c.use,
      })),
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const landUseCsvPath = join(__dirname, "data", "cbs-land-use-2017.csv");
const cropsCsvPath = join(__dirname, "data", "cbs-arable-crops-2023.csv");

const rows = parseLandUseCsv(landUseCsvPath);
const netherlands = rows.find((r) => r.region === "The Netherlands");
if (!netherlands) {
  console.error('Could not find "The Netherlands" row in CSV');
  process.exit(1);
}

const allCrops = parseCropsCsv(cropsCsvPath);
const cropBreakdown = calculateCropBreakdown(allCrops, "2023");

const categories = analyse(netherlands, cropBreakdown.feedShareOfFieldCrops);

if (process.argv.includes("--json")) {
  printJson(categories, cropBreakdown);
} else {
  printTable(categories);
  printCropBreakdown(cropBreakdown);

  console.log("\nData sources:");
  console.log("  Land use: CBS Bodemgebruik 2017 — https://opendata.cbs.nl/#/CBS/en/dataset/70262ENG/table");
  console.log("  Farm types: CBS Landbouwtelling 2023 — https://opendata.cbs.nl/#/CBS/en/dataset/80783ENG/table");
  console.log("  Arable crops: CBS 7100eng 2023 — https://opendata.cbs.nl/#/CBS/en/dataset/7100eng/table");
  console.log("\nNote: Water surfaces (inland + tidal) are excluded from the total.");
  console.log(`Livestock feed share of field crops: ${(cropBreakdown.feedShareOfFieldCrops * 100).toFixed(1)}% (calculated from crop data).`);
}
