import React from "react";

// CBS 2022 data: https://www.cbs.nl/en-gb/dossier/nitrogen/nitrogen-emissions-into-the-atmosphere
const NH3_DATA = [
  { sector: "Agriculture", pct: 90.9, highlight: true },
  { sector: "Households", pct: 3.5 },
  { sector: "Road traffic", pct: 2.8 },
  { sector: "Industry & waste", pct: 2.1 },
  { sector: "Construction & other", pct: 0.8, highlight: true, color: "green" },
];

const NOX_DATA = [
  { sector: "Road traffic", pct: 33.9 },
  { sector: "Other mobile sources", pct: 17.9 },
  { sector: "Industry & waste", pct: 14.1 },
  { sector: "Inland navigation", pct: 13.4 },
  { sector: "Energy sector", pct: 10.1 },
  { sector: "Households", pct: 3.6 },
  { sector: "Agriculture", pct: 2.6, highlight: true },
  { sector: "Other", pct: 4.4 },
];

// Total nitrogen: 100M kg from NH₃ (67%) + 49M kg from NOₓ (33%)
const NH3_WEIGHT = 0.67;
const NOX_WEIGHT = 0.33;

const TOTAL_DATA = (() => {
  const map = new Map<string, { pct: number; highlight: boolean; color?: "orange" | "green" }>();
  const add = (
    data: { sector: string; pct: number; highlight?: boolean; color?: "orange" | "green" }[],
    weight: number,
  ) => {
    for (const d of data) {
      const existing = map.get(d.sector) || { pct: 0, highlight: false };
      existing.pct += d.pct * weight;
      if (d.highlight) existing.highlight = true;
      if (d.color) existing.color = d.color;
      map.set(d.sector, existing);
    }
  };
  add(NH3_DATA, NH3_WEIGHT);
  add(NOX_DATA, NOX_WEIGHT);

  return [...map.entries()]
    .map(([sector, { pct, highlight, color }]) => ({ sector, pct: Math.round(pct * 10) / 10, highlight, color }))
    .sort((a, b) => b.pct - a.pct);
})();

type BarDatum = { sector: string; pct: number; highlight?: boolean; color?: "orange" | "green" };

function BarChart({
  data,
  label,
  sublabel,
}: {
  data: BarDatum[];
  label: string;
  sublabel: string;
}) {
  const max = Math.max(...data.map((d) => d.pct));

  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-2">
        <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
          {label}
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400 ml-2">
          {sublabel}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.sector} className="flex items-center gap-2">
            <div className="w-[140px] sm:w-[170px] text-right text-xs text-stone-600 dark:text-stone-400 shrink-0 truncate">
              {d.sector}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div
                className="h-5 rounded-sm transition-all"
                style={{
                  width: `${(d.pct / max) * 100}%`,
                  minWidth: d.pct > 0 ? "2px" : "0",
                  backgroundColor: d.highlight
                    ? d.color === "green"
                      ? "rgb(22, 163, 74)" // green-600
                      : "rgb(234, 88, 12)" // orange-600
                    : "rgb(168, 162, 158)", // stone-400
                  opacity: d.highlight ? 1 : 0.5,
                }}
              />
              <span
                className={`text-xs tabular-nums shrink-0 ${
                  d.highlight
                    ? d.color === "green"
                      ? "font-semibold text-green-600 dark:text-green-400"
                      : "font-semibold text-orange-600 dark:text-orange-400"
                    : "text-stone-500 dark:text-stone-400"
                }`}
              >
                {d.pct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NitrogenChart() {
  return (
    <div className="lg:-mx-24 xl:-mx-40">
    <figure className="my-8 p-4 sm:p-6 bg-stone-50 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
      <figcaption className="mb-5">
        <div className="text-base font-semibold text-stone-900 dark:text-stone-100">
          Who emits the nitrogen?
        </div>
        <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
          Share of Dutch nitrogen emissions by sector, 2022.{" "}
          <span className="font-semibold text-orange-600 dark:text-orange-400">
            Agriculture
          </span>{" "}
          and{" "}
          <span className="font-semibold text-green-600 dark:text-green-400">
            construction
          </span>{" "}
          highlighted.
        </div>
      </figcaption>

      <BarChart
        data={NH3_DATA}
        label="Ammonia (NH₃)"
        sublabel="67% of total nitrogen — damages ecosystems near farms"
      />
      <BarChart
        data={NOX_DATA}
        label="Nitrogen oxides (NOₓ)"
        sublabel="33% of total nitrogen — from combustion"
      />
      <BarChart
        data={TOTAL_DATA}
        label="Combined nitrogen"
        sublabel="Weighted total (NH₃ + NOₓ)"
      />

      <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-700 text-[10px] text-stone-400 dark:text-stone-500">
        Source:{" "}
        <a
          href="https://www.cbs.nl/en-gb/dossier/nitrogen/nitrogen-emissions-into-the-atmosphere"
          className="underline hover:text-stone-600 dark:hover:text-stone-300"
          target="_blank"
          rel="noopener"
        >
          CBS, 2022
        </a>
        . NH₃ and NOₓ weighted by their share of total nitrogen mass (100M kg
        and 49M kg respectively).
      </div>
    </figure>
    </div>
  );
}
