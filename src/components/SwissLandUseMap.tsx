import React, { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PolygonLayer } from "@deck.gl/layers";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

const INITIAL_VIEW_STATE = {
  // Centred on the Swiss Mittelland
  longitude: 7.45,
  latitude: 46.95,
  zoom: isMobile ? 7.5 : 8,
  pitch: 30,
  bearing: 0,
};

type PolygonFeature = {
  polygon: number[][][] | number[][][][];
};

/** Extract polygon coordinate rings from a GeoJSON geometry */
function extractPolygons(geojson: any): PolygonFeature[] {
  const features: PolygonFeature[] = [];
  for (const feature of geojson.features ?? [geojson]) {
    const geom = feature.geometry ?? feature;
    if (geom.type === "Polygon") {
      features.push({ polygon: geom.coordinates });
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        features.push({ polygon: poly });
      }
    }
  }
  return features;
}

type LayerData = {
  animalAg: PolygonFeature[];
  plantAg: PolygonFeature[];
  residential: PolygonFeature[];
};

export default function SwissLandUseMap() {
  const [hintVisible, setHintVisible] = useState(true);
  const [data, setData] = useState<LayerData | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Hide hint on first real user interaction
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !hintVisible) return;
    const hide = () => setHintVisible(false);
    const events = ["pointerdown", "wheel", "touchstart"] as const;
    events.forEach((e) =>
      el.addEventListener(e, hide, { once: true, passive: true }),
    );
    return () => events.forEach((e) => el.removeEventListener(e, hide));
  }, [hintVisible]);

  // Fetch and parse all GeoJSON files
  useEffect(() => {
    Promise.all([
      fetch("/data/agriculture_animal_ch.geojson").then((r) => r.json()),
      fetch("/data/agriculture_plant_ch.geojson").then((r) => r.json()),
      fetch("/data/bauzonen_residential_2022.geojson").then((r) => r.json()),
    ]).then(([animalGeo, plantGeo, residentialGeo]) => {
      setData({
        animalAg: extractPolygons(animalGeo),
        plantAg: extractPolygons(plantGeo),
        residential: extractPolygons(residentialGeo),
      });
    });
  }, []);

  const layers = useMemo(() => {
    if (!data) return [];
    return [
      new PolygonLayer<PolygonFeature>({
        id: "animal-agriculture-layer",
        data: data.animalAg,
        getPolygon: (d) => d.polygon,
        filled: true,
        stroked: true,
        extruded: false,
        pickable: false,
        getFillColor: [255, 100, 0, 40],
        getLineColor: [255, 100, 0, 120],
        lineWidthMinPixels: 1,
      }),
      new PolygonLayer<PolygonFeature>({
        id: "plant-agriculture-layer",
        data: data.plantAg,
        getPolygon: (d) => d.polygon,
        filled: true,
        stroked: true,
        extruded: false,
        pickable: false,
        getFillColor: [255, 220, 0, 50],
        getLineColor: [255, 220, 0, 130],
        lineWidthMinPixels: 1,
      }),
      new PolygonLayer<PolygonFeature>({
        id: "residential-layer",
        data: data.residential,
        getPolygon: (d) => d.polygon,
        filled: true,
        stroked: true,
        extruded: false,
        pickable: false,
        getFillColor: [57, 255, 20, 25],
        getLineColor: [57, 255, 20, 80],
        lineWidthMinPixels: 1,
      }),
    ];
  }, [data]);

  const legendContent = (
    <>
      <div className="font-bold mb-2 text-sm uppercase tracking-wider text-stone-700 dark:text-stone-300">
        Land Use Map
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ff6400] opacity-40 mt-0.5 shrink-0"></span>
          <div>
            <div className="font-bold text-[#cc5000] dark:text-[#ff6400]">
              Animal Agriculture
            </div>
            <p className="text-xs text-stone-800 dark:text-stone-300 leading-tight">
              Grassland, meadows, pastures, and alpine summer grazing.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ffdc00] opacity-50 mt-0.5 shrink-0"></span>
          <div>
            <div className="font-bold text-[#b89b00] dark:text-[#ffdc00]">
              Plant Agriculture
            </div>
            <p className="text-xs text-stone-800 dark:text-stone-300 leading-tight">
              Arable crops — wheat, barley, maize, potatoes, vegetables.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-3 h-3 rounded-full bg-[#39ff14] mt-0.5 shrink-0"></span>
          <div>
            <div className="font-bold text-[#1a8a0e] dark:text-[#39ff14]">
              Building Zones
            </div>
            <p className="text-xs text-stone-800 dark:text-stone-300 leading-tight">
              Residential, mixed-use, and center zones — where people live.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-stone-200 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-500 italic">
        Sources: Nutzungsflächen (geodienste.ch) 2025, Bauzonen (KGK-CGC) 2022
      </div>
    </>
  );

  return (
    <div className="lg:-mx-24 xl:-mx-40">
      <div className="my-8 relative shadow-2xl sm:shadow-none rounded-xl overflow-hidden">
        {/* Map */}
        <div
          ref={mapRef}
          className="h-[600px] w-full relative rounded-t-xl sm:rounded-xl overflow-hidden sm:shadow-2xl border border-b-0 sm:border-b border-stone-200 dark:border-stone-800 bg-[#0a0a0a] [clip-path:inset(0_round_0.75rem_0.75rem_0_0)] sm:[clip-path:inset(0_round_0.75rem)]"
        >
          <DeckGL
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={layers}
            useDevicePixels={1}
            style={{ position: "absolute", inset: 0 }}
          >
            <Map mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" />
          </DeckGL>

          {/* Interaction hint */}
          {hintVisible && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none animate-pulse"
              style={{ zIndex: 99999 }}
            >
              {isMobile
                ? "Pinch & drag to explore"
                : "Scroll to zoom, drag to explore"}
            </div>
          )}
        </div>

        {/* Desktop: overlay on map */}
        <div className="hidden sm:block absolute top-4 left-4 z-10 max-w-[220px]">
          <div className="bg-stone-50/80 dark:bg-black/80 backdrop-blur-md p-4 rounded-lg border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-white pointer-events-none">
            {legendContent}
          </div>
        </div>

        {/* Mobile: glued below map */}
        <div className="sm:hidden bg-stone-50 dark:bg-stone-950 p-4 rounded-b-xl border border-t-0 border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-white">
          {legendContent}
        </div>
      </div>
    </div>
  );
}
