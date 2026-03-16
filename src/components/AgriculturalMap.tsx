import React from "react";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer } from "@deck.gl/layers";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const INITIAL_VIEW_STATE = {
  // Amsterdam coordinates
  // Centred on the Randstad
  longitude: 4.75,
  latitude: 52.1,
  zoom: 8.5,
  pitch: 45,
  bearing: 0,
};

export default function AgriculturalMap() {
  const agriculturalLayer = new GeoJsonLayer({
    id: "agricultural-layer",
    data: "/data/agriculture_2017.geojson",
    filled: true,
    stroked: true,
    extruded: false,
    getFillColor: [255, 100, 0, 40],
    getLineColor: [255, 100, 0, 120],
    lineWidthMinPixels: 1,
  });

  const urbanLayer = new GeoJsonLayer({
    id: "urban-layer",
    data: "/data/urban_2017.geojson",
    filled: true,
    stroked: true,
    extruded: false,
    getFillColor: [57, 255, 20, 25],
    getLineColor: [57, 255, 20, 80],
    lineWidthMinPixels: 1,
  });

  return (
    <div className="lg:-mx-24 xl:-mx-40">
    <div className="my-8 h-[600px] w-full relative rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#0a0a0a]">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={[agriculturalLayer, urbanLayer]}
      >
        <Map mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" />
      </DeckGL>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md p-4 rounded-lg border border-white/10 text-xs text-white z-10 pointer-events-none max-w-[200px]">
        <div className="font-bold mb-2 text-sm uppercase tracking-wider text-gray-400">
          Land Use Map
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff6400] opacity-40 mt-0.5 shrink-0"></span>
            <div>
              <div className="font-bold text-[#ff6400]">Agricultural Land</div>
              <p className="text-[10px] text-gray-400 leading-tight">
                All farming combined (~66% of land). Roughly three-quarters is animal agriculture.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-full bg-[#39ff14] mt-0.5 shrink-0"></span>
            <div>
              <div className="font-bold text-[#39ff14]">Residential Areas</div>
              <p className="text-[10px] text-gray-400 leading-tight">
                Where millions of people live (~7% of land).
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-2 border-t border-white/10 text-[9px] text-gray-500 italic">
          Source: CBS Bodemgebruik 2017
        </div>
      </div>
    </div>
    </div>
  );
}
