import React, { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PolygonLayer } from "@deck.gl/layers";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

const INITIAL_VIEW_STATE = {
  // Centred on the Randstad
  longitude: 4.7,
  latitude: 52.1,
  zoom: isMobile ? 8 : 8.5,
  pitch: 45,
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
  agriculture: PolygonFeature[];
  urban: PolygonFeature[];
};

export default function AgriculturalMap() {
  const [hintVisible, setHintVisible] = useState(true);
  const [data, setData] = useState<LayerData | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Hide hint on first real user interaction
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !hintVisible) return;
    const hide = () => setHintVisible(false);
    const events = ["pointerdown", "wheel", "touchstart"] as const;
    events.forEach((e) => el.addEventListener(e, hide, { once: true, passive: true }));
    return () => events.forEach((e) => el.removeEventListener(e, hide));
  }, [hintVisible]);

  // Fetch and parse all GeoJSON files
  useEffect(() => {
    Promise.all([
      fetch("/data/agriculture_2017.geojson").then((r) => r.json()),
      fetch("/data/urban_2017.geojson").then((r) => r.json()),
    ]).then(([agGeo, urbanGeo]) => {
      setData({
        agriculture: extractPolygons(agGeo),
        urban: extractPolygons(urbanGeo),
      });
    });
  }, []);

  const layers = useMemo(() => {
    if (!data) return [];
    return [
      new PolygonLayer<PolygonFeature>({
        id: "agricultural-layer",
        data: data.agriculture,
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
        id: "urban-layer",
        data: data.urban,
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

          {/* Interaction hint — inside map container, after DeckGL */}
          {hintVisible && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none animate-pulse"
              style={{ zIndex: 99999 }}
            >
              {isMobile ? "Pinch & drag to explore" : "Scroll to zoom, drag to explore"}
            </div>
          )}
        </div>

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
