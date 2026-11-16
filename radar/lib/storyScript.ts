// The words of "Your Story": one documentary script, written from a place's real numbers.
// The same lines are shown on screen and spoken by the narrator, so reading and listening match.
// Rules: every number comes from StoryFacts (real data); interpretations stay hedged ("looked like",
// "usually means"); a sentence whose fact is missing is left out, never guessed.
import { StoryFacts, fmtDate, fmtKm2 } from "@/lib/story";

export type Mood = "prologue" | "sky" | "radar" | "water" | "change" | "sure" | "epilogue";

export interface ScriptChapter {
  id: string;           // section id on the page
  mood: Mood;           // music for this chapter
  n: number | null;     // chapter number (null for prologue and epilogue)
  kicker: string;
  title: string;
  /** Narration, one sentence or short passage per line. Shown on screen and spoken. */
  lines: string[];
  /** Play the water series as notes after the narration (the "hear the water" moment). */
  sonify?: boolean;
}

const NISAR_ALTITUDE_KM = 747; // NISAR's orbit altitude
const MANHATTAN_KM2 = 59.1;    // area of Manhattan island
const PITCH_KM2 = 0.00714;     // one football pitch (105 m x 68 m)

const month = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const year = (d: string) => d.slice(0, 4);
const r0 = (x: number) => Math.round(x).toLocaleString("en-GB");

/** "June to October 2026", or "December 2025 to March 2026". */
function season(first: string, last: string) {
  if (year(first) === year(last)) return month(first) === month(last) ? `${month(first)} ${year(first)}` : `${month(first)} to ${month(last)} ${year(last)}`;
  return `${month(first)} ${year(first)} to ${month(last)} ${year(last)}`;
}

/** Puts an area in everyday terms. */
export function relatable(km2: number): string | null {
  if (km2 >= MANHATTAN_KM2 * 0.8) {
    const k = km2 / MANHATTAN_KM2;
    return k < 1.5 ? "about the size of Manhattan" : `about ${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : r0(k)} times the size of Manhattan`;
  }
  if (km2 >= 0.05) return `roughly ${r0(km2 / PITCH_KM2)} football pitches`;
  return null;
}

/** Local solar time of a pass (UTC + longitude/15): NISAR crosses near dawn and dusk. */
export function passLocalTime(f: StoryFacts) {
  if (!f.passes.length) return null;
  const t = new Date(f.passes[0].start_time);
  if (Number.isNaN(t.getTime())) return null;
  const h = (((t.getUTCHours() + t.getUTCMinutes() / 60 + f.center[0] / 15) % 24) + 24) % 24;
  return { label: `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`, dark: h < 6.5 || h >= 18.5 };
}

type Change = { frac_increase?: number | null; frac_decrease?: number | null };

/* ---------- the season verdict ----------
 * The rule-based verdict (lib/data interpret) judges ONE pair of passes over the whole window, so a
 * change that builds up pass by pass over a season almost never counts. This verdict reads the whole
 * season of the place instead: what open water and hidden (under-vegetation) water did, from the same
 * CALCULATED areas the story shows. It is an interpretation, hedged as one, and never declares a flood. */

type Shape = "absent" | "steady" | "rose" | "fell" | "rose-fell" | "fell-rose";
interface Trend { shape: Shape; first: number; last: number; peak: number; peakDate: string; low: number; lowDate: string; range: number }

/** A change counts if it is at least a quarter of where it started and big enough to matter in this window. */
function meaningful(a: number, b: number, windowKm2: number) {
  return Math.abs(b - a) >= Math.max(2, 0.01 * windowKm2) && Math.abs(b - a) / Math.max(a, b, 1) >= 0.25;
}

export function trendOf(values: number[], dates: string[], windowKm2: number): Trend {
  const n = values.length;
  const iMax = values.indexOf(Math.max(...values)), iMin = values.indexOf(Math.min(...values));
  const first = values[0], last = values[n - 1], peak = values[iMax], low = values[iMin];
  const t = { first, last, peak, peakDate: dates[iMax], low, lowDate: dates[iMin], range: peak - low };
  if (peak < 1) return { shape: "absent", ...t };
  if (iMax > 0 && iMax < n - 1 && meaningful(first, peak, windowKm2) && meaningful(peak, last, windowKm2)) return { shape: "rose-fell", ...t };
  if (iMin > 0 && iMin < n - 1 && meaningful(first, low, windowKm2) && meaningful(low, last, windowKm2)) return { shape: "fell-rose", ...t };
  if (meaningful(first, last, windowKm2)) return { shape: last > first ? "rose" : "fell", ...t };
  return { shape: "steady", ...t };
}

const SHORT: Record<"hidden" | "open", Record<Exclude<Shape, "absent" | "steady">, string>> = {
  hidden: { rose: "hidden water rose through the season", fell: "hidden water drained away", "rose-fell": "hidden water came and went", "fell-rose": "hidden water dipped, then returned" },
  open: { rose: "open water spread through the season", fell: "open water shrank", "rose-fell": "open water rose and fell", "fell-rose": "open water dipped, then returned" },
};

function trendSentence(label: string, t: Trend): string {
  const k = (x: number) => `${fmtKm2(x)} square kilometres`;
  switch (t.shape) {
    case "absent": return `${label} was almost absent, under one square kilometre on every pass.`;
    case "steady": return `${label} stayed much the same, around ${k((t.first + t.last) / 2)}.`;
    case "rose": return `${label} grew from ${fmtKm2(t.first)} to ${k(t.last)}${t.peak > t.last * 1.1 ? `, peaking at ${fmtKm2(t.peak)} on ${fmtDate(t.peakDate)}` : ""}.`;
    case "fell": return `${label} fell from ${fmtKm2(t.first)} to ${k(t.last)}.`;
    case "rose-fell": return `${label} rose from ${fmtKm2(t.first)} to ${k(t.peak)} by ${fmtDate(t.peakDate)}, then fell back to ${fmtKm2(t.last)}.`;
    case "fell-rose": return `${label} fell from ${fmtKm2(t.first)} to ${k(t.low)} by ${fmtDate(t.lowDate)}, then came back to ${fmtKm2(t.last)}.`;
  }
}

export function seasonVerdict(f: StoryFacts): { headline: string; lines: string[] } {
  const dates = f.passes.map((p) => p.date);
  const win = f.commonKm2 ?? f.windowKm2;
  const hidden = trendOf(f.passes.map((p) => p.flooded_veg_km2), dates, win);
  const open = trendOf(f.passes.map((p) => p.water_km2), dates, win);
  const moving = ([["hidden", hidden], ["open", open]] as const).filter(([, t]) => t.shape !== "absent" && t.shape !== "steady");
  // the lead is the signal that changed most for its size (a lake's open water can swing by more km²
  // than the forest around it, while the forest's hidden water grew five-fold)
  const lead = moving.sort((a, b) => b[1].range / Math.max(b[1].peak, 1) - a[1].range / Math.max(a[1].peak, 1))[0];

  const headline = lead ? SHORT[lead[0]][lead[1].shape as Exclude<Shape, "absent" | "steady">]
    : hidden.shape === "absent" && open.shape === "absent" ? "little water to see here"
    : "a steady season";

  const lines: string[] = [];
  const hiddenLine = trendSentence("Water hidden under vegetation", hidden);
  const openLine = trendSentence("Open water", open);
  const [main, other] = lead?.[0] === "open" ? [openLine, hiddenLine] : [hiddenLine, openLine];
  lines.push(`Across ${f.n} passes, from ${fmtDate(f.first)} to ${fmtDate(f.last)}: ${main.charAt(0).toLowerCase()}${main.slice(1)}`);
  lines.push(other);

  // how the single biggest step compares (the rule-based check of one pair of passes)
  if (f.biggest && f.verdict) {
    const c = (f.biggest as unknown as { HH_change?: Change }).HH_change;
    const pct = Math.round(((c?.frac_increase ?? 0) + (c?.frac_decrease ?? 0)) * 100);
    const step = `${fmtDate(f.biggest.before)} to ${fmtDate(f.biggest.after)}`;
    lines.push(
      f.verdict === "No significant radar change"
        ? lead ? "No single step between two passes was big enough to count on its own: the change built up, pass by pass."
               : "No single step between two passes was big enough to count as a real change either."
      : f.verdict === "Radar change detected" ? `One step stood out: from ${step}, ${pct} percent of the ground changed clearly, enough to count as a real radar change.`
      : f.verdict === "Possible inundation-related signal" ? `One step, from ${step}, changed the way new water under vegetation does.`
      : `The biggest step, from ${step}, changed ${pct} percent of the ground, but the radar alone cannot say what changed.`,
    );
  }

  // how much to trust it
  lines.push(f.n < 4 ? `With only ${f.n} passes, this is a first look, not yet a trend.`
    : f.partialPasses.length ? `The satellite's strip covered only part of this area, so these numbers describe the ${fmtKm2(win)} square kilometres seen on every pass.`
    : `${f.n} passes over ${f.spanDays} days make this a fair picture of the season here.`);

  if (lead?.[0] === "hidden") lines.push("In towns, buildings throw the radar back the same way, so check the map before reading this as water.");
  lines.push("None of this is a confirmed flood. A water-level gauge, a clear photograph, or someone standing there would confirm it.");
  return { headline, lines };
}

export function buildScript(f: StoryFacts): ScriptChapter[] {
  const when = season(f.first, f.last);
  const local = passLocalTime(f);
  const chapters: ScriptChapter[] = [];

  // PROLOGUE
  chapters.push({
    id: "s-cover", mood: "prologue", n: null, kicker: "A story told by radar", title: f.place,
    lines: [
      `From ${r0(NISAR_ALTITUDE_KM)} kilometres up, ${f.place} looks like any other piece of the Earth.`,
      `But from ${when}, something moved through it that no ordinary camera could follow.`,
      `NISAR, a radar satellite built by NASA and India's space agency, passed over it ${f.n} times in ${f.spanDays} days. This is what it saw.`,
    ],
  });

  // 1. SKY
  const sky: string[] = [];
  if (f.cloudyPasses != null && f.cloudKnown > 0) {
    const most = f.cloudyPasses / f.cloudKnown >= 0.5;
    sky.push(most
      ? `On ${f.cloudyPasses} of the ${f.cloudKnown} days NISAR flew over, cloud covered more than half the sky at that very hour.`
      : `The sky here was often kinder: cloud covered most of it on only ${f.cloudyPasses} of the ${f.cloudKnown} passes.`);
  } else {
    sky.push("We could not find cloud records for these days. For radar, it does not matter.");
  }
  if (local?.dark) sky.push(`And NISAR crossed at about ${local.label} local time, in darkness, when a camera sees nothing at all.`);
  if (f.rainTotal != null && f.rainTotal >= 1) {
    sky.push(`About ${r0(f.rainTotal)} millimetres of rain fell over those ${f.spanDays} days${f.rainiest && f.rainiest.mm >= 5 ? `, ${r0(f.rainiest.mm)} of them on ${fmtDate(f.rainiest.date)} alone` : ""}.`);
  }
  sky.push("A camera sees the top of the cloud. Radar sees the ground.");
  chapters.push({
    id: "s-sky", mood: "sky", n: 1, kicker: "Above the clouds",
    title: local?.dark ? "A camera would have seen clouds, or nothing at all." : "A camera would have seen clouds.",
    lines: sky,
  });

  // 2. RADAR
  chapters.push({
    id: "s-radar", mood: "radar", n: 2, kicker: "A light of its own", title: `${f.n} looks at ${f.place}, through everything.`,
    lines: [
      "NISAR does not wait for sunlight. It sends its own pulses: microwaves twenty-four centimetres long, which pass through cloud, rain, and even some leaves.",
      "Calm water bounces the pulse away, like a mirror, so it stays black.",
      "Forest scatters it back softly. But where water stands beneath the trees, the pulse ricochets off the water and the trunks and comes straight home, glowing bright.",
      "These are the real images, one for every pass. Watch the dark and the bright.",
    ],
  });

  // 3. HIDDEN WATER
  const water: string[] = [];
  const wFirst = f.waterFirst, wLast = f.waterLast, peak = f.waterPeak;
  if (peak.water_km2 < 1) {
    water.push("Almost no open, calm water showed up here, less than one square kilometre on every pass.");
  } else {
    const change = wFirst > 0 ? (wLast - wFirst) / wFirst : null;
    water.push(`On the first pass, ${fmtKm2(wFirst)} square kilometres looked like open water.`);
    if (change != null && Math.abs(change) < 0.1) water.push(`By ${fmtDate(f.last)}, it was much the same: ${fmtKm2(wLast)}.`);
    else water.push(`By ${fmtDate(f.last)}, it was ${fmtKm2(wLast)}${change != null ? `, ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change * 100))} percent` : ""}.`);
    if (f.n > 2 && peak.date !== f.first && peak.date !== f.last) {
      const rel = relatable(peak.water_km2);
      water.push(`The water reached its peak on ${fmtDate(peak.date)}: ${fmtKm2(peak.water_km2)} square kilometres${rel ? `, ${rel}` : ""}.`);
    }
  }
  if (f.vegPeak.flooded_veg_km2 >= 1) {
    const rel = relatable(f.vegPeak.flooded_veg_km2);
    water.push(`Then there is the hidden signal: ground that throws the radar straight back. It peaked on ${fmtDate(f.vegPeak.date)}, at ${fmtKm2(f.vegPeak.flooded_veg_km2)} square kilometres${rel ? `, ${rel}` : ""}.`);
    water.push("Away from towns, that usually means water standing under trees or crops, invisible from above.");
    const vLast = f.passes[f.passes.length - 1].flooded_veg_km2;
    if (f.vegPeak.date !== f.last && vLast < f.vegPeak.flooded_veg_km2 * 0.75) {
      water.push(`By ${fmtDate(f.last)}, the signal had faded to ${fmtKm2(vLast)} square kilometres, as you would expect when floodwater drains out from under the trees.`);
    } else if (f.vegPeak.date === f.last && f.passes[0].flooded_veg_km2 < f.vegPeak.flooded_veg_km2 * 0.75) {
      water.push(`It had grown from ${fmtKm2(f.passes[0].flooded_veg_km2)} on the first pass, as you would expect when water rises beneath them.`);
    }
  }
  water.push("Listen. Each note is one pass. The higher the note, the more water.");
  chapters.push({ id: "s-water", mood: "water", n: 3, kicker: "The hidden water", title: "How much water was hiding here?", lines: water, sonify: true });

  // 4. TURNING POINT
  if (f.biggest) {
    const c = (f.biggest as unknown as { HH_change?: Change }).HH_change;
    const inc = (c?.frac_increase ?? 0) * 100, dec = (c?.frac_decrease ?? 0) * 100;
    const after = f.passes.find((p) => p.date === f.biggest!.after);
    const lines = [
      `Of all the moments in this story, one stands out: ${fmtDate(f.biggest.before)} to ${fmtDate(f.biggest.after)}.`,
      `In just ${f.biggest.delta_days} days, ${inc.toFixed(1)} percent of the ground grew clearly brighter, and ${dec.toFixed(1)} percent grew clearly darker.${
        f.secondScore != null && f.secondScore < f.biggestScore * 0.7 ? " No other interval came close." : " It was the largest change between any two passes."}`,
    ];
    if (after?.rain7_mm != null && after.rain7_mm >= 1) lines.push(`In the week before, ${r0(after.rain7_mm)} millimetres of rain had fallen.`);
    const close = {
      "Possible inundation-related signal": "Something on the ground had changed, in the way water does. The radar saw exactly where.",
      "Radar change detected": "Something on the ground had changed. The radar saw exactly where.",
      "No significant radar change": "Yet over the area as a whole, even this change was not strong enough to call significant. Sometimes the honest story is the quieter one.",
      "Insufficient evidence": "What changed is not yet clear: the radar alone is not enough to say.",
    } as const;
    if (f.verdict) lines.push(close[f.verdict]); // unknown until the detailed grid has loaded: say nothing
    chapters.push({ id: "s-change", mood: "change", n: 4, kicker: "The turning point", title: `${fmtDate(f.biggest.before)} → ${fmtDate(f.biggest.after)}`, lines });
  }

  // 5. HOW SURE: this place's own verdict, from its whole season
  const sv = seasonVerdict(f);
  chapters.push({
    id: "s-sure", mood: "sure", n: f.biggest ? 5 : 4, kicker: "What we know, and what we don't",
    title: `Verdict: ${sv.headline}.`,
    lines: sv.lines,
  });

  // EPILOGUE
  chapters.push({
    id: "s-next", mood: "epilogue", n: null, kicker: "The story goes on", title: "Every place has water we cannot see.",
    lines: [
      `NISAR maps nearly all of Earth's land and ice twice every twelve days. It will be back over ${f.place} soon, looking again, through cloud and darkness.`,
      "Every place has water we cannot see. Choose yours.",
    ],
  });
  return chapters;
}
