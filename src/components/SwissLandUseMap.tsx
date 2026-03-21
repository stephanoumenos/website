import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { registerPMTiles } from "../lib/pmtiles-buffer";

const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

export default function SwissLandUseMap() {
  const [hintVisible, setHintVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    registerPMTiles([
      "/data/agriculture_animal_ch.pmtiles",
      "/data/agriculture_plant_ch.pmtiles",
      "/data/bauzonen_residential_2022.pmtiles",
    ]);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [7.45, 46.95],
      zoom: isMobile ? 7.5 : 8,
      pitch: 30,
      bearing: 0,
      attributionControl: true,
    });

    map.on("style.load", () => {
      // Find the first symbol layer (labels) so we can insert data beneath it
      const firstSymbol = map
        .getStyle()
        .layers.find((l) => l.type === "symbol")?.id;

      // 3D terrain + hillshade
      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 12,
      });

      map.setTerrain({ source: "terrain-dem", exaggeration: 2.0 });

      // Primary light from NW (cartographic standard)
      map.addLayer(
        {
          id: "hillshade",
          type: "hillshade",
          source: "terrain-dem",
          paint: {
            "hillshade-shadow-color": "#000000",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#cccccc",
            "hillshade-exaggeration": 0.8,
            "hillshade-illumination-direction": 315,
          },
        },
        "landcover",
      );

      // Secondary light from NE — fills in shadows, more white coverage
      map.addLayer(
        {
          id: "hillshade-secondary",
          type: "hillshade",
          source: "terrain-dem",
          paint: {
            "hillshade-shadow-color": "transparent",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#999999",
            "hillshade-exaggeration": 0.4,
            "hillshade-illumination-direction": 45,
          },
        },
        "landcover",
      );

      // Mask: hide hillshade outside Switzerland
      map.addSource("ch-mask", {
        type: "geojson",
        data: "/data/ch_mask.geojson",
      });

      map.addLayer(
        {
          id: "ch-mask-fill",
          type: "fill",
          source: "ch-mask",
          paint: {
            "fill-color": "#0e0e0e",
            "fill-opacity": 1,
          },
        },
        "landcover",
      );

      map.addSource("animal-ag", {
        type: "vector",
        url: "pmtiles:///data/agriculture_animal_ch.pmtiles",
      });
      map.addSource("plant-ag", {
        type: "vector",
        url: "pmtiles:///data/agriculture_plant_ch.pmtiles",
      });
      map.addSource("residential", {
        type: "vector",
        url: "pmtiles:///data/bauzonen_residential_2022.pmtiles",
      });

      const dataLayers: maplibregl.LayerSpecification[] = [
        // Dark backgrounds to block hillshade from bleeding through
        {
          id: "animal-ag-bg",
          type: "fill",
          source: "animal-ag",
          "source-layer": "animal_agriculture",
          paint: { "fill-color": "#0e0e0e", "fill-opacity": 1 },
        },
        {
          id: "plant-ag-bg",
          type: "fill",
          source: "plant-ag",
          "source-layer": "plant_agriculture",
          paint: { "fill-color": "#0e0e0e", "fill-opacity": 1 },
        },
        {
          id: "residential-bg",
          type: "fill",
          source: "residential",
          "source-layer": "residential",
          paint: { "fill-color": "#0e0e0e", "fill-opacity": 1 },
        },
        // Colored fills on top of dark backgrounds
        {
          id: "animal-ag-fill",
          type: "fill",
          source: "animal-ag",
          "source-layer": "animal_agriculture",
          paint: { "fill-color": "#ff6400", "fill-opacity": 0.15 },
        },
        {
          id: "animal-ag-line",
          type: "line",
          source: "animal-ag",
          "source-layer": "animal_agriculture",
          paint: {
            "line-color": "#ff6400",
            "line-opacity": 0.47,
            "line-width": 1,
          },
        },
        {
          id: "plant-ag-fill",
          type: "fill",
          source: "plant-ag",
          "source-layer": "plant_agriculture",
          paint: { "fill-color": "#ffdc00", "fill-opacity": 0.2 },
        },
        {
          id: "plant-ag-line",
          type: "line",
          source: "plant-ag",
          "source-layer": "plant_agriculture",
          paint: {
            "line-color": "#ffdc00",
            "line-opacity": 0.51,
            "line-width": 1,
          },
        },
        {
          id: "residential-fill",
          type: "fill",
          source: "residential",
          "source-layer": "residential",
          paint: { "fill-color": "#39ff14", "fill-opacity": 0.1 },
        },
        {
          id: "residential-line",
          type: "line",
          source: "residential",
          "source-layer": "residential",
          paint: {
            "line-color": "#39ff14",
            "line-opacity": 0.31,
            "line-width": 1,
          },
        },
      ];

      for (const layer of dataLayers) {
        map.addLayer(layer, firstSymbol);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Hide hint on first real user interaction
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hintVisible) return;
    const hide = () => setHintVisible(false);
    const events = ["pointerdown", "wheel", "touchstart"] as const;
    events.forEach((e) =>
      el.addEventListener(e, hide, { once: true, passive: true }),
    );
    return () => events.forEach((e) => el.removeEventListener(e, hide));
  }, [hintVisible]);

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
          ref={containerRef}
          className="h-[600px] w-full relative rounded-t-xl sm:rounded-xl overflow-hidden sm:shadow-2xl border border-b-0 sm:border-b border-stone-200 dark:border-stone-800 bg-[#0a0a0a] [clip-path:inset(0_round_0.75rem_0.75rem_0_0)] sm:[clip-path:inset(0_round_0.75rem)]"
        />

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
