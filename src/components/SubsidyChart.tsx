import React from "react";

// EU budget 2024 (commitments): €189.4B total
// https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=LEGISSUM:4745602
const EU_BUDGET = [
  { label: "Cohesion & regional", value: 65, color: "rgb(209, 213, 219)" },
  {
    label: "Agriculture (CAP)",
    value: 54,
    color: "rgb(234, 88, 12)",
    highlight: true,
  },
  { label: "Innovation & digital", value: 21, color: "rgb(209, 213, 219)" },
  { label: "Foreign affairs & aid", value: 16, color: "rgb(209, 213, 219)" },
  { label: "Administration", value: 12, color: "rgb(209, 213, 219)" },
  { label: "Other", value: 11, color: "rgb(209, 213, 219)" },
  { label: "Migration & defence", value: 6, color: "rgb(209, 213, 219)" },
  { label: "Environment (non-CAP)", value: 4, color: "rgb(209, 213, 219)" },
];
const EU_TOTAL = 189;

// Leiden University / Nature Food study (Kortleve et al., 2024)
// Based on 2013 CAP data — most recent year for food supply model used
// https://www.universiteitleiden.nl/en/news/2024/04/how-eu-farm-subsidies-favour-high-emission-animal-products
const SUBSIDY_DATA = [
  {
    label: "Animal feed crops",
    value: 21,
    color: "rgb(234, 88, 12)",
    highlight: true,
  },
  {
    label: "Direct livestock farming",
    value: 18,
    color: "rgb(234, 88, 12)",
    highlight: true,
  },
  { label: "Plant-based food", value: 11, color: "green" },
  { label: "Non-food & other", value: 7, color: "rgb(168, 162, 158)" },
];
const CAP_TOTAL = 57;

function HorizontalBars({
  data,
  title,
}: {
  data: { label: string; value: number; color: string; highlight?: boolean }[];
  title: string;
}) {
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="mb-6">
      <div className="text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <div className="w-[150px] sm:w-[180px] text-right text-sm text-stone-600 dark:text-stone-400 shrink-0 truncate">
              {d.label}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div
                className="h-7 rounded-sm"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  minWidth: "2px",
                  backgroundColor: d.color,
                  opacity: d.highlight ? 1 : 0.6,
                }}
              />
              <span
                className={`text-sm tabular-nums shrink-0 ${
                  d.highlight
                    ? "font-semibold text-orange-600 dark:text-orange-400"
                    : "text-stone-500 dark:text-stone-400"
                }`}
              >
                €{d.value}B
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SubsidyChart() {
  return (
    <div className="lg:-mx-24 xl:-mx-40">
      <figure className="my-8 p-4 sm:p-6 bg-stone-50 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
        <figcaption className="mb-5">
          <div className="text-base font-semibold text-stone-900 dark:text-stone-100">
            €54 billion a year for farming — and where it goes
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            The CAP is the EU's second-largest spending programme.{" "}
            <span className="font-semibold text-orange-600 dark:text-orange-400">
              82% of that farm budget
            </span>{" "}
            supports animal products.
          </div>
        </figcaption>

        {/* EU budget — horizontal bars */}
        <HorizontalBars
          data={EU_BUDGET}
          title={`EU budget 2024 — €${EU_TOTAL}B total`}
        />

        {/* CAP breakdown — horizontal bars */}
        <div className="pt-4 border-t border-stone-200 dark:border-stone-700">
          <HorizontalBars
            data={SUBSIDY_DATA}
            title={`Inside the CAP — €${CAP_TOTAL}B per year`}
          />
        </div>

        {/* Annotation */}
        <div className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed -mt-2 mb-4">
          The same animal products that receive{" "}
          <span className="font-semibold text-orange-600 dark:text-orange-400">
            82%
          </span>{" "}
          of farm subsidies account for an estimated{" "}
          <span className="font-semibold text-orange-600 dark:text-orange-400">
            84%
          </span>{" "}
          of the EU's food-related greenhouse gas emissions.
        </div>

        <div className="pt-3 border-t border-stone-200 dark:border-stone-700 text-[10px] text-stone-400 dark:text-stone-500">
          Sources: EU budget from{" "}
          <a
            href="https://eur-lex.europa.eu/EN/legal-content/summary/2024-european-union-budget.html"
            className="underline hover:text-stone-600 dark:hover:text-stone-300"
            target="_blank"
            rel="noopener"
          >
            Council of the EU, 2024
          </a>
          . CAP breakdown from{" "}
          <a
            href="https://www.universiteitleiden.nl/en/news/2024/04/how-eu-farm-subsidies-favour-high-emission-animal-products"
            className="underline hover:text-stone-600 dark:hover:text-stone-300"
            target="_blank"
            rel="noopener"
          >
            Kortleve et al., <i>Nature Food</i>, 2024
          </a>
          . CAP breakdown based on 2013 expenditure data. "Non-food & other"
          includes tobacco, cotton, biofuels, and non-food-allocated rural
          development.
        </div>
      </figure>
    </div>
  );
}
