import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { registerPMTiles } from "../lib/pmtiles-buffer";

const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

export default function AgriculturalMap() {
  const [hintVisible, setHintVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    registerPMTiles([
      "/data/agriculture_2017.pmtiles",
      "/data/urban_2017.pmtiles",
    ]);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [4.7, 52.1],
      zoom: isMobile ? 8 : 8.5,
      pitch: 45,
      bearing: 0,
      attributionControl: true,
    });

    map.on("style.load", () => {
      // Find the first symbol layer (labels) so we can insert data beneath it
      const firstSymbol = map
        .getStyle()
        .layers.find((l) => l.type === "symbol")?.id;

      map.addSource("agriculture", {
        type: "vector",
        url: "pmtiles:///data/agriculture_2017.pmtiles",
      });
      map.addSource("urban", {
        type: "vector",
        url: "pmtiles:///data/urban_2017.pmtiles",
      });

      const dataLayers: maplibregl.LayerSpecification[] = [
        {
          id: "agriculture-fill",
          type: "fill",
          source: "agriculture",
          "source-layer": "agriculture",
          paint: { "fill-color": "#ff6400", "fill-opacity": 0.15 },
        },
        {
          id: "agriculture-line",
          type: "line",
          source: "agriculture",
          "source-layer": "agriculture",
          paint: {
            "line-color": "#ff6400",
            "line-opacity": 0.47,
            "line-width": 1,
          },
        },
        {
          id: "urban-fill",
          type: "fill",
          source: "urban",
          "source-layer": "urban",
          paint: { "fill-color": "#39ff14", "fill-opacity": 0.1 },
        },
        {
          id: "urban-line",
          type: "line",
          source: "urban",
          "source-layer": "urban",
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
    events.forEach((e) => el.addEventListener(e, hide, { once: true, passive: true }));
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
            <div className="font-bold text-[#cc5000] dark:text-[#ff6400]">Agricultural Land</div>
            <p className="text-xs text-stone-800 dark:text-stone-300 leading-tight">
              All farming combined (~66% of land). Roughly three-quarters is
              animal agriculture.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-3 h-3 rounded-full bg-[#39ff14] mt-0.5 shrink-0"></span>
          <div>
            <div className="font-bold text-[#1a8a0e] dark:text-[#39ff14]">Residential Areas</div>
            <p className="text-xs text-stone-800 dark:text-stone-300 leading-tight">
              Where millions of people live (~7% of land).
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-stone-200 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-500 italic">
        Source: CBS Bodemgebruik 2017
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

        {/* Interaction hint — inside map container, after DeckGL */}
        {hintVisible && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none animate-pulse"
            style={{ zIndex: 99999 }}
          >
            {isMobile ? "Pinch & drag to explore" : "Scroll to zoom, drag to explore"}
          </div>
        )}

        {/* Desktop: overlay on map */}
        <div className="hidden sm:block absolute top-4 left-4 z-10 max-w-[200px]">
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
