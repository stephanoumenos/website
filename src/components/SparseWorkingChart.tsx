import React, { useState, useMemo, useCallback } from "react";
import { motion } from "motion/react";

// --- Seeded PRNG (mulberry32) ---

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashParams(...args: number[]): number {
  let h = 0;
  for (const a of args) {
    h = Math.imul(h ^ ((a * 2654435761) | 0), 0x01000193);
  }
  return h >>> 0;
}

/** Box-Muller transform: two uniform randoms -> one standard normal */
function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// --- Math helpers ---

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: "work" | "idle";
};

/**
 * Traditional work model: focused work blocks with breaks.
 * Output grows linearly during work, flat during breaks.
 */
function traditionalSegments(totalHours: number): Segment[] {
  const workBlock = 50;
  const breakBlock = 10;
  const rate = 1;
  const totalMin = totalHours * 60;
  const segments: Segment[] = [];
  let t = 0;
  let y = 0;
  while (t < totalMin) {
    const workEnd = Math.min(t + workBlock, totalMin);
    const dy = (workEnd - t) * rate;
    segments.push({ x1: t, y1: y, x2: workEnd, y2: y + dy, type: "work" });
    y += dy;
    t = workEnd;
    if (t >= totalMin) break;
    const breakEnd = Math.min(t + breakBlock, totalMin);
    segments.push({ x1: t, y1: y, x2: breakEnd, y2: y, type: "idle" });
    t = breakEnd;
  }
  return segments;
}

/**
 * Agentic work model with Amdahl's law and optional stochastic noise.
 * When rng is provided, applies log-normal burst noise and per-cycle failure coin flips.
 */
function agenticSegments(
  totalHours: number,
  agents: number,
  agentSpeed: number,
  reviewMin: number,
  autonomyMin: number,
  responseDelayMin: number,
  serialFraction: number,
  reworkRate: number,
  rng?: () => number,
): Segment[] {
  const totalMin = totalHours * 60;
  const interventionMin = reviewMin;
  const waitMin = responseDelayMin;

  // Amdahl's law: effective speedup from parallelism
  const effectiveParallelism =
    serialFraction >= 1
      ? 1
      : 1 / (serialFraction + (1 - serialFraction) / Math.max(agents, 1));

  const exponent = 1 + Math.log2(Math.max(effectiveParallelism, 1)) * 0.25;

  const segments: Segment[] = [];
  let t = 0;
  let y = 0;

  while (t < totalMin) {
    // Human intervention
    const intEnd = Math.min(t + interventionMin, totalMin);
    const intDy = (intEnd - t) * 0.5;
    segments.push({ x1: t, y1: y, x2: intEnd, y2: y + intDy, type: "idle" });
    y += intDy;
    t = intEnd;
    if (t >= totalMin) break;

    // Agent burst
    const burstEnd = Math.min(t + autonomyMin, totalMin);
    const burstLen = burstEnd - t;
    let burstGain =
      agentSpeed *
      effectiveParallelism *
      0.6 *
      Math.pow(burstLen / autonomyMin, exponent) *
      autonomyMin;

    if (rng) {
      if (rng() < reworkRate) {
        burstGain = 0;
      } else {
        burstGain *= Math.exp(normalRandom(rng) * 0.3);
      }
    } else {
      burstGain *= 1 - reworkRate;
    }

    burstGain = Math.max(burstGain, 0);
    segments.push({ x1: t, y1: y, x2: burstEnd, y2: y + burstGain, type: "work" });
    y += burstGain;
    t = burstEnd;
    if (t >= totalMin) break;

    // Wait
    const waitEnd = Math.min(t + waitMin, totalMin);
    segments.push({ x1: t, y1: y, x2: waitEnd, y2: y, type: "idle" });
    t = waitEnd;
  }
  return segments;
}

/** Run N Monte Carlo simulations, return array of segment arrays */
function monteCarloRuns(
  n: number,
  totalHours: number,
  agents: number,
  agentSpeed: number,
  reviewMin: number,
  autonomyMin: number,
  responseDelayMin: number,
  serialFraction: number,
  reworkRate: number,
  baseSeed: number,
): Segment[][] {
  const runs: Segment[][] = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(baseSeed + i * 7919);
    runs.push(
      agenticSegments(
        totalHours, agents, agentSpeed, reviewMin, autonomyMin,
        responseDelayMin, serialFraction, reworkRate, rng,
      ),
    );
  }
  return runs;
}

/** Sample Y value at a given X from segments (linear interpolation within segments) */
function sampleYAtX(segments: Segment[], x: number): number {
  for (const seg of segments) {
    if (x >= seg.x1 && x <= seg.x2) {
      if (seg.x2 === seg.x1) return seg.y1;
      const frac = (x - seg.x1) / (seg.x2 - seg.x1);
      return seg.y1 + frac * (seg.y2 - seg.y1);
    }
  }
  return segments.length > 0 ? segments[segments.length - 1].y2 : 0;
}

/** Compute percentile bands from Monte Carlo runs at regular X intervals */
function computeBands(
  runs: Segment[][],
  totalMin: number,
  step: number,
): { xs: number[]; p10: number[]; p50: number[]; p90: number[] } {
  const xs: number[] = [];
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  const n = runs.length;
  const i10 = Math.max(0, Math.floor(n * 0.1));
  const i50 = Math.floor(n * 0.5);
  const i90 = Math.min(n - 1, Math.floor(n * 0.9));

  for (let x = 0; x <= totalMin; x += step) {
    const ys = runs.map((r) => sampleYAtX(r, x)).sort((a, b) => a - b);
    xs.push(x);
    p10.push(ys[i10]);
    p50.push(ys[i50]);
    p90.push(ys[i90]);
  }
  return { xs, p10, p50, p90 };
}

function segmentsToPath(
  segments: Segment[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
  curved: boolean,
): string {
  if (segments.length === 0) return "";
  let d = `M ${xScale(segments[0].x1)} ${yScale(segments[0].y1)}`;
  for (const seg of segments) {
    if (curved && seg.type === "work") {
      const cx = xScale(seg.x2);
      const cy = yScale(seg.y1);
      d += ` Q ${cx} ${cy} ${xScale(seg.x2)} ${yScale(seg.y2)}`;
    } else {
      d += ` L ${xScale(seg.x2)} ${yScale(seg.y2)}`;
    }
  }
  return d;
}

function segmentsToArea(
  segments: Segment[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
  baseline: number,
  curved: boolean,
): string {
  if (segments.length === 0) return "";
  const line = segmentsToPath(segments, xScale, yScale, curved);
  const lastSeg = segments[segments.length - 1];
  const firstSeg = segments[0];
  return `${line} L ${xScale(lastSeg.x2)} ${baseline} L ${xScale(firstSeg.x1)} ${baseline} Z`;
}

/** Build SVG path for confidence band (p90 forward, p10 backward) */
function bandToPath(
  xs: number[],
  upper: number[],
  lower: number[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): string {
  if (xs.length === 0) return "";
  let d = `M ${xScale(xs[0])} ${yScale(upper[0])}`;
  for (let i = 1; i < xs.length; i++) {
    d += ` L ${xScale(xs[i])} ${yScale(upper[i])}`;
  }
  for (let i = xs.length - 1; i >= 0; i--) {
    d += ` L ${xScale(xs[i])} ${yScale(lower[i])}`;
  }
  d += " Z";
  return d;
}

/** Build SVG path from sampled values */
function sampledToPath(
  xs: number[],
  ys: number[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): string {
  if (xs.length === 0) return "";
  let d = `M ${xScale(xs[0])} ${yScale(ys[0])}`;
  for (let i = 1; i < xs.length; i++) {
    d += ` L ${xScale(xs[i])} ${yScale(ys[i])}`;
  }
  return d;
}

// --- Timeline helpers ---

type TimelineBlock = { x1: number; x2: number; active: boolean };

function traditionalTimeline(totalHours: number): TimelineBlock[] {
  const totalMin = totalHours * 60;
  const blocks: TimelineBlock[] = [];
  let t = 0;
  while (t < totalMin) {
    const workEnd = Math.min(t + 50, totalMin);
    blocks.push({ x1: t, x2: workEnd, active: true });
    t = workEnd;
    if (t >= totalMin) break;
    const breakEnd = Math.min(t + 10, totalMin);
    blocks.push({ x1: t, x2: breakEnd, active: false });
    t = breakEnd;
  }
  return blocks;
}

function agenticTimeline(
  totalHours: number,
  reviewMin: number,
  autonomyMin: number,
  responseDelayMin: number,
): TimelineBlock[] {
  const totalMin = totalHours * 60;
  const blocks: TimelineBlock[] = [];
  let t = 0;
  while (t < totalMin) {
    const intEnd = Math.min(t + reviewMin, totalMin);
    blocks.push({ x1: t, x2: intEnd, active: true });
    t = intEnd;
    if (t >= totalMin) break;
    const idleEnd = Math.min(t + autonomyMin + responseDelayMin, totalMin);
    blocks.push({ x1: t, x2: idleEnd, active: false });
    t = idleEnd;
  }
  return blocks;
}

// --- Slider ---

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
          {label}
        </label>
        <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      {hint && (
        <span className="text-[10px] leading-tight text-stone-400 dark:text-stone-500">
          {hint}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-stone-200 dark:bg-stone-700
          accent-teal-700 dark:accent-teal-400"
      />
    </div>
  );
}

// --- Chart ---

const CHART_W = 800;
const CHART_H = 420;
const PAD = { top: 24, right: 24, bottom: 44, left: 56 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
const N_RUNS = 20;
const SAMPLE_STEP = 5; // minutes between band sample points

export default function SparseWorkingChart() {
  const [tradWorkday, setTradWorkday] = useState(8);
  const [agentWorkday, setAgentWorkday] = useState(12);
  const [agents, setAgents] = useState(3);
  const [agentSpeed, setAgentSpeed] = useState(3);
  const [reviewTime, setReviewTime] = useState(5);
  const [autonomy, setAutonomy] = useState(20);
  const [responseDelay, setResponseDelay] = useState(3);
  const [serialFraction, setSerialFraction] = useState(0.15);
  const [reworkRate, setReworkRate] = useState(0.15);
  const [seedOffset, setSeedOffset] = useState(0);

  const maxWorkday = Math.max(tradWorkday, agentWorkday);
  const totalMin = maxWorkday * 60;

  // Traditional: fixed baseline
  const tradSegs = useMemo(() => traditionalSegments(tradWorkday), [tradWorkday]);
  const tradTotal = tradSegs.length > 0 ? tradSegs[tradSegs.length - 1].y2 : 1;

  // Monte Carlo runs
  const baseSeed = useMemo(
    () => hashParams(agentWorkday, agents, Math.round(agentSpeed * 100), reviewTime, autonomy,
      responseDelay, Math.round(serialFraction * 1000), Math.round(reworkRate * 1000),
      seedOffset),
    [agentWorkday, agents, agentSpeed, reviewTime, autonomy, responseDelay, serialFraction, reworkRate, seedOffset],
  );

  const mcRuns = useMemo(
    () => monteCarloRuns(
      N_RUNS, agentWorkday, agents, agentSpeed, reviewTime, autonomy, responseDelay,
      serialFraction, reworkRate, baseSeed,
    ),
    [agentWorkday, agents, agentSpeed, reviewTime, autonomy, responseDelay, serialFraction, reworkRate, baseSeed],
  );

  // Compute percentile bands (in raw Y space, before normalization)
  const rawBands = useMemo(
    () => computeBands(mcRuns, totalMin, SAMPLE_STEP),
    [mcRuns, totalMin],
  );

  // Normalize: divide all Y values by tradTotal
  const bands = useMemo(() => ({
    xs: rawBands.xs,
    p10: rawBands.p10.map((v) => v / tradTotal),
    p50: rawBands.p50.map((v) => v / tradTotal),
    p90: rawBands.p90.map((v) => v / tradTotal),
  }), [rawBands, tradTotal]);

  const normTradSegs = useMemo(
    () => tradSegs.map((s) => ({ ...s, y1: s.y1 / tradTotal, y2: s.y2 / tradTotal })),
    [tradSegs, tradTotal],
  );

  // Normalize MC runs for sample path rendering
  const normMcRuns = useMemo(
    () => mcRuns.map((run) => run.map((s) => ({ ...s, y1: s.y1 / tradTotal, y2: s.y2 / tradTotal }))),
    [mcRuns, tradTotal],
  );

  // Multiplier stats from bands
  const medianMult = bands.p50.length > 0 ? bands.p50[bands.p50.length - 1] : 0;
  const p10Mult = bands.p10.length > 0 ? bands.p10[bands.p10.length - 1] : 0;
  const p90Mult = bands.p90.length > 0 ? bands.p90[bands.p90.length - 1] : 0;

  // Leverage ratio: output per active minute (agentic vs traditional)
  const tradTimeline = useMemo(() => traditionalTimeline(tradWorkday), [tradWorkday]);
  const agentTimeline = useMemo(
    () => agenticTimeline(agentWorkday, reviewTime, autonomy, responseDelay),
    [agentWorkday, reviewTime, autonomy, responseDelay],
  );

  const idleStats = useMemo(() => {
    const calc = (blocks: TimelineBlock[]) => {
      let idle = 0;
      let active = 0;
      let total = 0;
      for (const b of blocks) {
        const dur = b.x2 - b.x1;
        total += dur;
        if (b.active) active += dur;
        else idle += dur;
      }
      return { idle, active, total, pct: total > 0 ? (idle / total) * 100 : 0 };
    };
    return { trad: calc(tradTimeline), agent: calc(agentTimeline) };
  }, [tradTimeline, agentTimeline]);

  const leverage = useMemo(() => {
    const tradActiveFrac = idleStats.trad.active / Math.max(idleStats.trad.total, 1);
    const agentActiveFrac = idleStats.agent.active / Math.max(idleStats.agent.total, 1);
    if (agentActiveFrac <= 0 || tradActiveFrac <= 0) return 0;
    return (medianMult / agentActiveFrac) / (1 / tradActiveFrac);
  }, [medianMult, idleStats]);

  // Use 95th percentile for Y axis scaling
  const maxY = useMemo(() => {
    const maxBand = Math.max(1, ...bands.p90);
    return maxBand * 1.15;
  }, [bands.p90]);

  const xScale = useCallback(
    (v: number) => PAD.left + (v / totalMin) * PLOT_W,
    [totalMin],
  );
  const yScale = useCallback(
    (v: number) => PAD.top + PLOT_H - (v / maxY) * PLOT_H,
    [maxY],
  );

  const baseline = PAD.top + PLOT_H;

  // Traditional curve paths
  const tradPath = useMemo(
    () => segmentsToPath(normTradSegs, xScale, yScale, false),
    [normTradSegs, xScale, yScale],
  );
  const tradArea = useMemo(
    () => segmentsToArea(normTradSegs, xScale, yScale, baseline, false),
    [normTradSegs, xScale, yScale, baseline],
  );

  // Confidence band path
  const bandPath = useMemo(
    () => bandToPath(bands.xs, bands.p90, bands.p10, xScale, yScale),
    [bands, xScale, yScale],
  );

  // Sample path strings (faint individual runs)
  const samplePaths = useMemo(
    () => normMcRuns.map((run) => segmentsToPath(run, xScale, yScale, true)),
    [normMcRuns, xScale, yScale],
  );

  // Median line path
  const medianPath = useMemo(
    () => sampledToPath(bands.xs, bands.p50, xScale, yScale),
    [bands, xScale, yScale],
  );

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const raw = maxY / 5;
    const nice = raw <= 0.5 ? 0.25 : raw <= 1 ? 0.5 : raw <= 2.5 ? 1 : raw <= 5 ? 2 : Math.ceil(raw / 5) * 5;
    const ticks: number[] = [];
    for (let v = 0; v <= maxY; v += nice) {
      ticks.push(v);
    }
    return ticks;
  }, [maxY]);

  // X-axis ticks
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = 0; h <= maxWorkday; h++) {
      ticks.push(h * 60);
    }
    return ticks;
  }, [maxWorkday]);

  return (
    <div className="lg:-mx-24 xl:-mx-40">
      <figure className="my-10 p-5 sm:p-8 bg-stone-50 dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
        <figcaption className="mb-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Cumulative output over a workday
            </div>
            {medianMult > 0 && (
              <span className="text-sm font-medium text-teal-700 dark:text-teal-400">
                ~{medianMult.toFixed(1)}x median
                <span className="text-stone-400 dark:text-stone-500 font-normal ml-1.5">
                  ({p10Mult.toFixed(1)}x–{p90Mult.toFixed(1)}x)
                </span>
              </span>
            )}
          </div>
          <div className="text-sm text-stone-500 dark:text-stone-400 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-5 h-[3px] rounded-full bg-stone-400 dark:bg-stone-500" />
              <span>Traditional (50 min work / 10 min break)</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="relative inline-flex items-center justify-center w-5 h-3">
                <span className="absolute inset-0 rounded-sm bg-teal-700/15 dark:bg-teal-400/15" />
                <span className="relative inline-block w-5 h-[3px] rounded-full bg-teal-700 dark:bg-teal-400" />
              </span>
              <span>Agentic (median + 10th–90th percentile)</span>
            </span>
          </div>

          {/* Stats row */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {leverage > 0 && (
              <span className="text-stone-600 dark:text-stone-300">
                Leverage: <span className="font-semibold tabular-nums text-teal-700 dark:text-teal-400">{leverage.toFixed(1)}x</span>
                <span className="text-stone-400 dark:text-stone-500 ml-1">output per active minute</span>
              </span>
            )}
          </div>
        </figcaption>

        {/* Chart */}
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            role="img"
            aria-label="Chart comparing cumulative output of traditional linear work vs stochastic agentic work over time"
          >
            {/* Grid lines */}
            {yTicks.map((tick, i) => (
              <line
                key={i}
                x1={PAD.left}
                y1={yScale(tick)}
                x2={PAD.left + PLOT_W}
                y2={yScale(tick)}
                className="stroke-stone-200 dark:stroke-stone-700"
                strokeWidth={0.5}
              />
            ))}

            {/* X axis labels */}
            {xTicks.map((tickMin) => (
              <text
                key={tickMin}
                x={xScale(tickMin)}
                y={baseline + 24}
                textAnchor="middle"
                className="fill-stone-400 dark:fill-stone-500 text-[12px]"
              >
                {tickMin / 60}h
              </text>
            ))}

            {/* Y axis labels */}
            {yTicks.map((tick, i) => (
              <text
                key={i}
                x={PAD.left - 8}
                y={yScale(tick) + 3}
                textAnchor="end"
                className="fill-stone-400 dark:fill-stone-500 text-[12px]"
              >
                {tick === 0 ? "0" : `${Number.isInteger(tick) ? tick : tick.toFixed(1)}x`}
              </text>
            ))}

            {/* Axis labels */}
            <text
              x={xScale(totalMin / 2)}
              y={baseline + 40}
              textAnchor="middle"
              className="fill-stone-500 dark:fill-stone-400 text-[12px] font-medium"
            >
              Hours
            </text>
            <text
              x={PAD.left - 8}
              y={PAD.top - 8}
              textAnchor="end"
              className="fill-stone-500 dark:fill-stone-400 text-[11px] font-medium"
            >
              Output (relative)
            </text>

            {/* Traditional fill */}
            <motion.path
              d={tradArea}
              className="fill-stone-400/10 dark:fill-stone-500/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            />

            {/* Confidence band (p10–p90) */}
            <motion.path
              d={bandPath}
              className="fill-teal-700/12 dark:fill-teal-400/12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />

            {/* Sample paths (faint individual MC runs) */}
            {samplePaths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                className="stroke-teal-700/[0.10] dark:stroke-teal-400/[0.10]"
                strokeWidth={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Traditional line */}
            <motion.path
              d={tradPath}
              fill="none"
              className="stroke-stone-400 dark:stroke-stone-500"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />

            {/* Agentic median line */}
            <motion.path
              d={medianPath}
              fill="none"
              className="stroke-teal-700 dark:stroke-teal-400"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
            />

            {/* Axes */}
            <line
              x1={PAD.left}
              y1={PAD.top}
              x2={PAD.left}
              y2={baseline}
              className="stroke-stone-300 dark:stroke-stone-600"
              strokeWidth={1}
            />
            <line
              x1={PAD.left}
              y1={baseline}
              x2={PAD.left + PLOT_W}
              y2={baseline}
              className="stroke-stone-300 dark:stroke-stone-600"
              strokeWidth={1}
            />
          </svg>
        </div>

        {/* Controls */}
        <div className="mt-6 pt-5 border-t border-stone-200 dark:border-stone-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Workday */}
            <div>
              <div className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-3 uppercase tracking-wider">
                Workday
              </div>
              <div className="flex flex-col gap-3">
                <Slider
                  label="Traditional"
                  value={tradWorkday}
                  min={4}
                  max={16}
                  step={1}
                  onChange={setTradWorkday}
                  formatValue={(v) => `${v} hours`}
                />
                <Slider
                  label="Agentic"
                  value={agentWorkday}
                  min={4}
                  max={16}
                  step={1}
                  onChange={setAgentWorkday}
                  formatValue={(v) => `${v} hours`}
                />
              </div>
            </div>

            {/* Agent setup */}
            <div>
              <div className="text-xs font-medium text-teal-700 dark:text-teal-400 mb-3 uppercase tracking-wider">
                Agent setup
              </div>
              <div className="flex flex-col gap-3">
                <Slider
                  label="Parallel agents"
                  value={agents}
                  min={1}
                  max={8}
                  step={1}
                  onChange={setAgents}
                />
                <Slider
                  label="Agent speed (vs human)"
                  value={agentSpeed}
                  min={0.5}
                  max={10}
                  step={0.5}
                  onChange={setAgentSpeed}
                  formatValue={(v) => `${v}x`}
                />
                <Slider
                  label="Autonomy"
                  value={autonomy}
                  min={5}
                  max={45}
                  step={5}
                  onChange={setAutonomy}
                  formatValue={(v) => `${v} min`}
                />
                <Slider
                  label="Review + prompt time"
                  hint="Time you spend reviewing diffs and writing the next prompt"
                  value={reviewTime}
                  min={1}
                  max={15}
                  step={1}
                  onChange={setReviewTime}
                  formatValue={(v) => `${v} min`}
                />
                <Slider
                  label="Your response delay"
                  hint="Time before you get back to it after the agent finishes"
                  value={responseDelay}
                  min={1}
                  max={60}
                  step={1}
                  onChange={setResponseDelay}
                  formatValue={(v) => `${v} min`}
                />
              </div>
            </div>

            {/* Constraints */}
            <div>
              <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-3 uppercase tracking-wider">
                Constraints
              </div>
              <div className="flex flex-col gap-3">
                <Slider
                  label="Sequential work %"
                  hint="Work that must happen in order and can't be split across agents"
                  value={serialFraction}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={setSerialFraction}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Failure probability"
                  value={reworkRate}
                  min={0}
                  max={0.8}
                  step={0.05}
                  onChange={setReworkRate}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-stone-400 dark:text-stone-500">
            Y axis normalized: 1x = total traditional output. Teal band shows 20 Monte Carlo
            paths; median and 10th–90th percentile. Constraints only affect the agentic curve.
          </span>
          <button
            onClick={() => setSeedOffset((s) => s + 1)}
            className="ml-4 shrink-0 text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors cursor-pointer"
            title="Regenerate Monte Carlo paths with a new random seed"
          >
            Reroll ↻
          </button>
        </div>

        {/* Idle time timeline */}
        <div className="mt-6 pt-5 border-t border-stone-200 dark:border-stone-700">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">
            Your day, from the human's perspective
          </div>
          <div className="flex flex-col gap-4">
            {/* Traditional timeline */}
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Traditional</span>
                <span className="text-xs tabular-nums flex gap-3">
                  <span className="text-stone-500 dark:text-stone-400">
                    <span className="font-medium text-stone-600 dark:text-stone-300">{Math.round(idleStats.trad.active)} min</span> working
                  </span>
                  <span className="text-stone-400 dark:text-stone-500">
                    <span className="font-medium">{Math.round(idleStats.trad.idle)} min</span> on break
                  </span>
                </span>
              </div>
              <svg viewBox={`0 0 ${totalMin} 20`} className="w-full h-6 rounded-md overflow-hidden" preserveAspectRatio="none">
                <rect x={0} y={0} width={totalMin} height={20} className="fill-stone-200 dark:fill-stone-800" />
                {tradTimeline.filter(b => b.active).map((b, i) => (
                  <motion.rect
                    key={i}
                    x={b.x1}
                    y={0}
                    width={b.x2 - b.x1}
                    height={20}
                    className="fill-stone-400 dark:fill-stone-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: i * 0.02 }}
                  />
                ))}
              </svg>
            </div>
            {/* Agentic timeline */}
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Agentic</span>
                <span className="text-xs tabular-nums flex gap-3">
                  <span className="text-teal-700/70 dark:text-teal-400/70">
                    <span className="font-medium text-teal-700 dark:text-teal-400">{Math.round(idleStats.agent.active)} min</span> working
                  </span>
                  <span className="text-stone-400 dark:text-stone-500">
                    <span className="font-medium">{Math.round(idleStats.agent.idle)} min</span> idle
                  </span>
                </span>
              </div>
              <svg viewBox={`0 0 ${totalMin} 20`} className="w-full h-6 rounded-md overflow-hidden" preserveAspectRatio="none">
                <rect x={0} y={0} width={totalMin} height={20} className="fill-stone-200 dark:fill-stone-800" />
                {agentTimeline.filter(b => b.active).map((b, i) => (
                  <motion.rect
                    key={i}
                    x={b.x1}
                    y={0}
                    width={b.x2 - b.x1}
                    height={20}
                    className="fill-teal-700 dark:fill-teal-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: i * 0.02 }}
                  />
                ))}
              </svg>
            </div>
          </div>
          {/* Hour markers */}
          <div className="flex justify-between mt-1.5">
            {xTicks.map((tickMin) => (
              <span key={tickMin} className="text-[10px] text-stone-400 dark:text-stone-500">
                {tickMin / 60}h
              </span>
            ))}
          </div>
        </div>
      </figure>
    </div>
  );
}
