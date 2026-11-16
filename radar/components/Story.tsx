"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, Check, Cloud, CloudRain, Globe2, Loader2, Map as MapIcon, MapPin, Music, Pause, Play, Search, Share2,
  ShieldCheck, SkipForward, Subtitles, Volume2, VolumeX,
} from "lucide-react";
import type { GridIndex, Manifest } from "@/lib/data";
import { ExampleInfo, IMG_CORS, imgUrl, loadExample, loadExamples } from "@/lib/data";
import { Rainfall, acquisitions, errorText, geocode, job as getJob, loadResult, startAnalysis } from "@/lib/api";
import { useIsPublicDemo } from "@/components/PublicDemoNote";
import { StoryFacts, buildStory, fmtDate, fmtKm2 } from "@/lib/story";
import { ScriptChapter, buildScript, passLocalTime, relatable } from "@/lib/storyScript";
import { Tag } from "@/components/ui";
import { MAT, MAT_LABEL, LiveResult } from "@/components/LiveSearch";
import { storySound } from "@/lib/sound";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CASE_ID = "tonle_sap";

/* ---------- small animation helpers ---------- */

function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function CountUp({ to, active, decimals = 0, ms = 1400 }: { to: number; active: boolean; decimals?: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, active, ms]);
  return <>{v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</>;
}

/* ---------- radar flipbook ---------- */

/** The radar images of every pass, played in turn. `fit` = the screen height left for it (CSS length),
 *  so the whole image is always on screen; `switchable` adds a radar / likely-water switch. */
function Flipbook({ m, layer: layer0 = "HH", interval = 1100, big = false, fit, switchable = false }: {
  m: Manifest; layer?: "HH" | "class"; interval?: number; big?: boolean; fit?: string; switchable?: boolean;
}) {
  const [layer, setLayer] = useState<"HH" | "class">(layer0);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Which images have arrived. The flipbook only ever shows a frame that has loaded, so a slow
  // server gives a short wait and then a shorter loop, never a blank frame in the middle of it.
  const [got, setGot] = useState<Record<string, "ok" | "failed">>({});
  const [attempt, setAttempt] = useState(0);
  const obs = m.observations;
  const mark = (date: string, v: "ok" | "failed") => setGot((g) => (g[date] === v ? g : { ...g, [date]: v }));
  const ready = obs.filter((o) => got[o.date] === "ok");
  const failed = obs.filter((o) => got[o.date] === "failed").length;
  const waiting = obs.length - ready.length - failed;
  useEffect(() => {
    if (!playing || ready.length < 2) return;
    const t = setInterval(() => { setI((k) => k + 1); if (big) storySound.blip(); }, interval);
    return () => clearInterval(t);
  }, [playing, ready.length, interval, big]);
  const ratio = m.display.ny / m.display.nx;
  const cur = ready.length ? ready[i % ready.length] : null; // never index past the end (e.g. after switching places)
  const retry = () => { setGot({}); setAttempt((a) => a + 1); };
  return (
    <figure className={`relative mx-auto w-full ${fit ? "" : big ? "max-w-2xl" : "max-w-md"}`}
      style={fit ? { maxWidth: `calc((${fit}) / ${ratio})` } : undefined}>
      {switchable && (
        <div className="mb-2 flex justify-center">
          <div className="flex overflow-hidden rounded-full border border-line text-[12px]" role="group" aria-label="Image">
            {([["HH", "Radar image"], ["class", "Likely water"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setLayer(k)} aria-pressed={layer === k}
                className={`px-3 py-1 ${layer === k ? "bg-accent text-on-accent" : "text-muted hover:text-text"}`}>{label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="relative overflow-hidden rounded-xl border border-line bg-void" style={{ paddingTop: `${ratio * 100}%` }}>
        {obs.map((o) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${o.date}-${attempt}`} crossOrigin={IMG_CORS} src={imgUrl(m, `${o.date}_${layer === "class" ? "class" : "HH"}`)} alt={`NISAR ${layer} radar image, ${o.date}`}
            ref={(el) => { if (el?.complete) mark(o.date, el.naturalWidth > 0 ? "ok" : "failed"); }}
            onLoad={() => mark(o.date, "ok")} onError={() => mark(o.date, "failed")}
            className="absolute inset-0 h-full w-full object-contain transition-opacity duration-500" style={{ opacity: o.date === cur?.date ? 1 : 0, imageRendering: "pixelated" }} />
        ))}
        {!cur && (
          <div className="on-map absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[14px]" role="status">
            {waiting > 0 ? <><Loader2 size={18} className="animate-spin" />Loading the radar images…</> : (
              <>
                <span>The radar images did not load. The server that holds them may have gone to sleep.</span>
                <button onClick={retry} className="rounded-md border border-current px-3 py-1.5 text-[13px] font-medium">Try again</button>
              </>
            )}
          </div>
        )}
        {cur && <div className="absolute top-3 left-3 rounded bg-bg/80 px-2 py-1 font-mono text-sm text-text">{fmtDate(cur.date)}</div>}
        {ready.length > 1 && (
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}
            className="absolute top-3 right-3 rounded-full bg-bg/80 p-1.5 text-accent">{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        )}
      </div>
      <div className="mt-2 flex gap-1" role="group" aria-label="Radar passes">
        {obs.map((o) => {
          const k = ready.findIndex((r) => r.date === o.date);
          return (
            <button key={o.date} disabled={k < 0} onClick={() => { setI(k); setPlaying(false); }}
              title={k < 0 ? `${o.date}: ${got[o.date] === "failed" ? "this image did not load" : "loading"}` : o.date} aria-label={o.date} aria-pressed={o.date === cur?.date}
              className={`h-1.5 flex-1 rounded-full transition-colors ${o.date === cur?.date ? "bg-accent" : k < 0 ? "bg-line opacity-50" : "bg-line hover:bg-muted"}`} />
          );
        })}
      </div>
      {cur && failed > 0 && (
        <p className="mt-1 text-center text-[12px] text-muted">
          {failed} of {obs.length} images did not load. <button onClick={retry} className="text-accent hover:text-accent-strong">Try again</button>
        </p>
      )}
      <figcaption className="mt-1 text-center text-[12px] text-muted">
        {layer === "class" ? "Cyan: water-like (calm, dark). Amber: flooded-vegetation-like (very bright)." : "Real NISAR radar. Dark = smooth surfaces such as calm water; bright = trees, towns, flooded forest."}
      </figcaption>
    </figure>
  );
}

/* ---------- choose your place ---------- */

interface Spot { id: string; place: string; country: string }

/** Splits "Amazon floodplain near Manaus, Brazil" into place and country. */
function spotOf(id: string, name: string): Spot {
  const parts = name.replace(/\s*\(.*\)$/, "").split(",").map((s) => s.trim()).filter(Boolean);
  return { id, place: parts[0] ?? name, country: parts.length > 1 ? parts[parts.length - 1] : "" };
}

function PlaceBar({ m, onResult, onCase, searchRef }: {
  m: Manifest | null | undefined; onResult: (r: LiveResult) => void; onCase: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const demo = useIsPublicDemo();
  const [examples, setExamples] = useState<ExampleInfo[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadExamples().then(setExamples).catch(() => setExamples([])); }, []);

  const spots: Spot[] = [spotOf(CASE_ID, "Tonle Sap Lake, Cambodia"), ...examples.map((x) => spotOf(x.id, x.name))];
  const currentId = !m ? null : m.area === CASE_ID ? CASE_ID : examples.find((x) => x.name === m.name)?.id ?? "custom";
  const custom = currentId === "custom" && m ? spotOf("custom", m.name) : null;

  async function openSpot(id: string) {
    if (busy || id === currentId) return;
    setErr(null);
    if (id === CASE_ID) { onCase(); return; }
    setBusy(id);
    try {
      const mm = await loadExample(id);
      if (!mm) throw new Error("This place could not be loaded.");
      onResult({ manifest: mm, footprint: examples.find((x) => x.id === id)?.footprint ?? null, checkedUtc: null });
    } catch (x) { setErr(errorText(x)); } finally { setBusy(null); }
  }

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2 || busy || demo) return;
    setBusy("search"); setErr(null);
    try {
      setStep(`Finding “${q.trim()}”…`);
      const places = await geocode(q);
      if (!places.length) throw new Error("We couldn't find that place. Try a country, city, river or coordinates.");
      const p = places[0];
      setStep(`Found ${p.name.split(",").slice(0, 2).join(",")}. Asking NASA's archive what NISAR has seen there…`);
      const a = await acquisitions(p.lat, p.lon);
      // a story needs a trend: prefer the newest comparable stack with the most passes (up to 4)
      const rank = { VALIDATED: 3, PROVISIONAL: 2, URGENT_RESPONSE: 1 } as Record<string, number>;
      const usable = a.stacks.filter((s) => s.usable && s.n_dates >= 2);
      const stack = [...usable].sort((x, y) =>
        (Math.min(y.n_dates, 4) - Math.min(x.n_dates, 4)) || ((y.latest ?? "") > (x.latest ?? "") ? 1 : (y.latest ?? "") < (x.latest ?? "") ? -1 : 0)
        || ((rank[y.maturity] ?? 0) - (rank[x.maturity] ?? 0)))[0];
      if (!stack) throw new Error(a.note ?? "NISAR has no comparable images here yet. Try a place on land or a coast.");
      const dual = stack.granules.filter((g) => g.pols.includes("HV"));
      const pick = (dual.length >= 2 ? dual : stack.granules).slice(-4);
      const what = `${pick.length} real radar passes (${pick[0].date} → ${pick[pick.length - 1].date}, ${MAT_LABEL[stack.maturity] ?? stack.maturity.toLowerCase()})`;
      setStep(`Reading ${what}. About 15 seconds…`);
      // "Dhaka, Dhaka Metropolitan, Dhaka Division, Bangladesh" -> "Dhaka, Bangladesh"
      const parts = p.name.split(",").map((s) => s.trim()).filter(Boolean);
      const place = parts.length > 1 ? `${parts[0]}, ${parts[parts.length - 1]}` : parts[0] ?? q.trim();
      // A story uses NISAR's 5 MHz side band (80 m cells): about 7x less to download than the main band,
      // plenty for a story. Products without a side band fall back to the main band.
      const run = async (detail: "quick" | "standard") => {
        let j = await startAnalysis({ lat: p.lat, lon: p.lon, scenes: pick.map((g) => g.scene), size_km: 20, detail, place });
        while (j.status === "queued" || j.status === "running") {
          await sleep(700);
          j = await getJob(j.job_id);
          if (j.status === "running" && j.message) setStep(`${j.message}: ${what}`);
        }
        return j;
      };
      let j = await run("quick");
      if (j.status === "error" && /frequencyB|band/i.test(j.message ?? "")) j = await run("standard");
      if (j.status === "error" || !j.result) throw new Error(j.message ?? "The analysis failed.");
      setStep("Writing your story…");
      const mm = await loadResult(j.result);
      onResult({ manifest: mm, footprint: stack.footprint, checkedUtc: a.checked_utc });
      setQ(""); setStep(null);
    } catch (x) { setErr(errorText(x)); setStep(null); } finally { setBusy(null); }
  }

  const chip = (s: Spot) => {
    const on = s.id === currentId;
    return (
      <button key={s.id} onClick={() => openSpot(s.id)} disabled={!!busy && busy !== s.id} aria-pressed={on}
        className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[13px] transition-colors disabled:opacity-50 ${on ? "border-amber bg-amber/15 text-text" : "border-line bg-bg hover:border-amber/60"}`}>
        {busy === s.id ? <Loader2 size={13} className="animate-spin text-amber" /> : <MapPin size={13} className={on ? "text-amber" : "text-muted"} />}
        <span className="font-medium">{s.place}</span>{s.country && <span className="text-muted">{s.country}</span>}
      </button>
    );
  };

  return (
    <div className="relative z-40 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:sticky lg:top-[52px] xl:top-0">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-amber"><Globe2 size={15} />Choose your place</div>
        <div className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-0.5">
          {spots.map(chip)}
          {custom && chip(custom)}
        </div>
        <form onSubmit={build} className="flex shrink-0 gap-2 lg:w-[22rem]">
          <div className="relative flex-1">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} disabled={demo || !!busy}
              aria-label="Your country, city or river"
              placeholder={demo ? "Any place: needs the full app" : "Your country, city or river…"}
              title={demo ? "Telling the story of a new place reads live radar, which needs the full app. Pick a saved place." : undefined}
              className="w-full rounded-md border border-line bg-bg py-1.5 pr-3 pl-8 text-[13px] focus:border-amber focus:outline-none disabled:opacity-60" />
          </div>
          <button disabled={demo || !!busy || q.trim().length < 2}
            className="flex items-center gap-1.5 rounded-md bg-amber px-3 py-1.5 text-[13px] font-medium text-bg disabled:opacity-40">
            {busy === "search" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}Tell it
          </button>
        </form>
      </div>
      {(step || err) && (
        <p aria-live="polite" className={`mt-2 flex items-center gap-2 text-[12px] ${err ? "text-rose" : "text-muted"}`}>
          {!err && <Loader2 size={12} className="animate-spin text-amber" />}{err ?? step}
        </p>
      )}
    </div>
  );
}

/* ---------- chapters ---------- */

/** One chapter: title card, then the narration (the line being spoken lights up), then the evidence. */
function Chapter({ ch, caption, onEnter, children }: {
  ch: ScriptChapter; caption: string; onEnter: () => void; children: (seen: boolean) => React.ReactNode;
}) {
  const [ref, seen] = useInView<HTMLElement>(0.2);
  const enterRef = useRef(onEnter); enterRef.current = onEnter;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) enterRef.current(); }, { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  const speaking = ch.lines.includes(caption);
  return (
    // Large screens: the words on the left, the evidence on the right, the whole chapter on one screen
    // (below the place bar), so nothing is cut off when a chapter opens. Small screens stack them.
    <section id={ch.id} ref={ref}
      className={`story-chapter relative grid scroll-mt-[64px] content-center gap-8 py-14 lg:min-h-[calc(100svh-64px)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-12 lg:py-8 ${seen ? "is-in" : ""}`}>
      <div className="relative">
        {ch.n != null && (
          <span aria-hidden className="reveal pointer-events-none absolute -top-12 -left-1 font-display text-[7rem] leading-none font-semibold text-amber/[0.07] select-none sm:text-[10rem]">
            {String(ch.n).padStart(2, "0")}
          </span>
        )}
        <div className="reveal relative flex items-center gap-3 text-[12px] tracking-[0.18em] text-amber uppercase">
          {ch.n != null && <><span className="font-mono">Chapter {ch.n}</span><span aria-hidden className="h-px w-10 bg-amber/50" /></>}
          <span>{ch.kicker}</span>
        </div>
        <h2 className="reveal reveal-d1 relative mt-3 font-display text-3xl leading-[1.08] font-medium sm:text-4xl xl:text-[2.6rem] lg:[@media(max-height:820px)]:text-[2rem]">{ch.title}</h2>
        <div className="reveal reveal-d2 relative mt-6 space-y-2.5 border-l-2 border-amber/40 pl-5">
          {ch.lines.map((l) => (
            <p key={l} className={`text-[17px] leading-relaxed transition-colors duration-500 xl:text-[18px] lg:[@media(max-height:820px)]:text-[15.5px] lg:[@media(max-height:820px)]:leading-normal ${!speaking || l === caption ? "text-text" : "text-text/45"}`}>{l}</p>
          ))}
        </div>
      </div>
      <div className="reveal reveal-d3 relative min-w-0">{children(seen)}</div>
    </section>
  );
}

/** The opening: the place's own radar images, full-bleed, drifting slowly, under its name. */
function Cover({ m, f, ch, onBegin, playing }: { m: Manifest; f: StoryFacts; ch: ScriptChapter; onBegin: () => void; playing: boolean }) {
  const [i, setI] = useState(0);
  const obs = m.observations;
  useEffect(() => {
    const t = setInterval(() => setI((k) => (k + 1) % Math.max(1, obs.length)), 3200);
    return () => clearInterval(t);
  }, [obs.length]);
  const [lon, lat] = f.center;
  return (
    <section id="s-cover" className="story-chapter is-in relative -mx-4 flex min-h-[calc(100svh-120px)] items-end overflow-hidden px-4 pt-24 pb-14 text-white sm:-mx-6 sm:px-6"
      style={{ background: "#07080f" }}>
      <div aria-hidden className="absolute inset-0">
        {obs.map((o, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={o.date} crossOrigin={IMG_CORS} src={imgUrl(m, `${o.date}_HH`)} alt=""
            className="kenburns absolute inset-0 h-full w-full object-cover transition-opacity duration-[2000ms]"
            style={{ opacity: k === i % Math.max(1, obs.length) ? 0.55 : 0 }} />
        ))}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 40%, transparent 0%, rgba(7,8,15,.55) 55%, rgba(7,8,15,.95) 100%), linear-gradient(to top, #07080f 5%, rgba(7,8,15,.2) 60%, rgba(7,8,15,.6) 100%)" }} />
        <div className="scanlines absolute inset-0 opacity-[0.07]" />
      </div>
      <div className="relative w-full max-w-5xl">
        <div className="reveal flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tracking-[0.22em] text-amber uppercase">
          <span>{ch.kicker}</span>
          <span className="font-mono tracking-normal text-white/60">{Math.abs(lat).toFixed(2)}°{lat >= 0 ? "N" : "S"} {Math.abs(lon).toFixed(2)}°{lon >= 0 ? "E" : "W"}</span>
        </div>
        <p className="reveal reveal-d1 mt-5 font-display text-xl text-white/80 sm:text-2xl">The water we cannot see</p>
        <h1 className="reveal reveal-d1 mt-1 font-display text-[3rem] leading-[0.98] font-semibold sm:text-[5.5rem]">{f.place}</h1>
        <p className="reveal reveal-d2 mt-6 max-w-2xl text-lg leading-relaxed text-white/85 sm:text-xl">{ch.lines.join(" ")}</p>
        <div className="reveal reveal-d3 mt-8 flex flex-wrap items-center gap-3">
          <button onClick={onBegin} className="flex items-center gap-2 rounded-full bg-amber px-6 py-3 text-[15px] font-semibold text-[#07080f] shadow-[0_0_40px_-8px] shadow-amber/70 hover:brightness-110">
            {playing ? <Pause size={17} /> : <Play size={17} />}{playing ? "Pause the story" : "Begin the story"}
          </button>
          <a href="#s-sky" className="flex items-center gap-1.5 rounded-full border border-white/25 px-5 py-3 text-[14px] text-white/90 hover:border-white/60"><ArrowDown size={15} />Read at your own pace</a>
          <span className="flex items-center gap-1.5 text-[12px] text-white/55"><Music size={13} />Narrated, with music. About {Math.max(3, Math.round(f.n * 0.25 + 3))} minutes.</span>
        </div>
        <div className="reveal reveal-d3 mt-8 flex flex-wrap gap-2 text-[11px]">
          <span className={`rounded border px-2 py-0.5 font-mono ${MAT[f.maturity] ?? MAT.OTHER}`}>{MAT_LABEL[f.maturity] ?? f.maturity} {f.crid}</span>
          <span className="rounded border border-white/20 px-2 py-0.5 font-mono text-white/60">{fmtDate(f.first)} → {fmtDate(f.last)} · {f.n} passes · track {f.track} · ~{fmtKm2(f.windowKm2)} km²</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- the story ---------- */

export default function Story({ m, grid, rain, onResult, onCase, onOpenMap, shareUrl }: {
  m: Manifest | null | undefined; grid: GridIndex | null; rain: Rainfall | null;
  onResult: (r: LiveResult) => void; onCase: () => void; onOpenMap: () => void; shareUrl: string | null;
}) {
  const f: StoryFacts | null = useMemo(() => (m && m.observations.length >= 2 ? buildStory(m, rain, grid) : null), [m, rain, grid]);
  const script = useMemo(() => (f ? buildScript(f) : []), [f]);
  const scriptRef = useRef(script); scriptRef.current = script;
  const searchRef = useRef<HTMLInputElement>(null);
  const [sound, setSound] = useState(false);
  const [music, setMusic] = useState(true);
  const [voice, setVoice] = useState(true);
  const [subs, setSubs] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(0);
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState(false);
  const run = useRef(0);

  const rainLevel = f?.rainTotal != null ? Math.min(1, f.rainTotal / Math.max(300, f.spanDays * 8)) : 0;
  const rainRef = useRef(rainLevel); rainRef.current = rainLevel;
  const fRef = useRef(f); fRef.current = f;

  useEffect(() => { storySound.onCaption = setCaption; return () => { storySound.onCaption = null; storySound.stop(); }; }, []);

  // a new place: stop, and start again at the top
  const placeKey = m ? `${m.area}|${m.name}|${m.stack}` : "";
  useEffect(() => {
    run.current++; setPlaying(false); setActive(0);
    storySound.cancelSpeech();
    window.scrollTo({ top: 0 });
  }, [placeKey]);

  const ensureSound = useCallback(() => {
    if (!storySound.enabled) { storySound.start(); }
    storySound.setMusic(music); storySound.setNarration(voice);
    setSound(true);
  }, [music, voice]);

  /** Documentary mode: each chapter in turn, moving on when the narrator finishes. */
  const playFrom = useCallback(async (start: number) => {
    const me = ++run.current;
    ensureSound();
    setPlaying(true);
    const chs = scriptRef.current;
    for (let i = start; i < chs.length; i++) {
      if (me !== run.current) return;
      const ch = chs[i];
      setActive(i);
      document.getElementById(ch.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      storySound.setMood(ch.mood, ch.mood === "sky" ? rainRef.current : undefined);
      await sleep(i === start ? 600 : 1800);
      if (me !== run.current) return;
      const ok = await storySound.speakLines(ch.lines);
      if (!ok || me !== run.current) return;
      if (ch.sonify && fRef.current) {
        const ff = fRef.current;
        await sleep(storySound.playSeries(ff.passes.map((p) => p.water_km2), 560, ff.passes.map((p) => p.flooded_veg_km2)));
      }
      await sleep(1500);
    }
    if (me === run.current) setPlaying(false);
  }, [ensureSound]);

  const pause = () => { run.current++; storySound.cancelSpeech(); setPlaying(false); };
  const begin = () => (playing ? pause() : playFrom(active >= scriptRef.current.length - 1 ? 0 : active));

  /** Reading at your own pace with sound on: each chapter sets its music and is narrated as it arrives. */
  const enter = (i: number) => {
    if (playing) return;
    setActive(i);
    if (!storySound.enabled) return;
    const ch = scriptRef.current[i];
    if (!ch) return;
    storySound.setMood(ch.mood, ch.mood === "sky" ? rainRef.current : undefined);
    void storySound.speakLines(ch.lines);
  };

  const toggleSound = () => {
    if (sound) { pause(); storySound.stop(); setSound(false); return; }
    ensureSound();
    const ch = scriptRef.current[active];
    if (ch) storySound.setMood(ch.mood, ch.mood === "sky" ? rainRef.current : undefined);
  };
  const toggleMusic = () => { const v = !music; setMusic(v); storySound.setMusic(v); };
  const toggleVoice = () => { const v = !voice; setVoice(v); storySound.setNarration(v); };
  const choose = () => {
    pause();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => searchRef.current?.focus(), 500);
  };

  const bar = <PlaceBar m={m} onResult={onResult} onCase={onCase} searchRef={searchRef} />;

  if (!m || !f) {
    return (
      <div>
        {bar}
        <div className="flex min-h-[60vh] flex-col justify-center py-16">
          {m === undefined ? (
            <p className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" />Loading the story…</p>
          ) : (
            <>
              <h1 className="font-display text-[2.6rem] leading-[1.02] font-medium sm:text-6xl">Your Story</h1>
              <p className="mt-3 max-w-2xl text-lg text-text/80">
                {m ? "This place has only one radar pass so far, and a story needs at least two. Choose another place above." :
                  "Every place has water we cannot see: under clouds, under trees, under the night. Choose a place above and NISAR's radar will tell its story."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const byId = Object.fromEntries(script.map((c, i) => [c.id, { c, i }]));
  const chapter = (id: string, body: (seen: boolean) => React.ReactNode) => {
    const x = byId[id];
    return x ? <Chapter key={id} ch={x.c} caption={caption} onEnter={() => enter(x.i)}>{body}</Chapter> : null;
  };
  const maxArea = Math.max(...f.passes.map((p) => p.water_km2 + p.flooded_veg_km2), 1);
  const local = passLocalTime(f);
  const share = () => { if (shareUrl) navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  return (
    <div className="story js-motion">
      {bar}

      {/* chapter rail */}
      <nav aria-label="Chapters" className="fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex">
        {script.map((c, i) => (
          <a key={c.id} href={`#${c.id}`} title={c.kicker} aria-label={c.kicker} aria-current={i === active ? "step" : undefined}
            className={`h-2 w-2 rounded-full transition-all ${i === active ? "scale-150 bg-amber" : "bg-line-strong hover:bg-amber/70"}`} />
        ))}
      </nav>

      <Cover m={m} f={f} ch={script[0]} onBegin={begin} playing={playing} />

      {/* 1. SKY */}
      {chapter("s-sky", (seen) => (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-2 text-[12px] text-muted">Cloud over this place at the hour of each NISAR pass</div>
            <div className="space-y-1.5">
              {f.passes.map((p, k) => (
                <div key={p.date} className="flex items-center gap-3 text-[12px]">
                  <span className="w-24 shrink-0 font-mono text-muted">{p.date}</span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded bg-panel-2">
                    <div className="grow-bar h-full bg-muted" style={{ width: p.cloud_pct != null ? `${p.cloud_pct}%` : "0%", transform: `scaleX(${seen ? 1 : 0})`, transitionDelay: `${k * 90}ms` }} />
                  </div>
                  <span className="flex w-16 shrink-0 items-center gap-1 text-text">{p.cloud_pct != null ? <><Cloud size={12} className="text-muted" />{Math.round(p.cloud_pct)}%</> : "–"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {f.cloudyPasses != null && (
              <Stat label="passes under mostly cloudy sky" value={<><CountUp to={f.cloudyPasses} active={seen} /> / {f.cloudKnown}</>} tone="text-text" />
            )}
            {f.meanCloud != null && <Stat label="average cloud cover at pass time" value={<><CountUp to={f.meanCloud} active={seen} />%</>} tone="text-text" />}
            {f.rainTotal != null && <Stat label={`rain over ${f.spanDays} days`} value={<><CountUp to={f.rainTotal} active={seen} /> mm</>} tone="text-blue" />}
            {local && <Stat label={local.dark ? "local time of the pass: dark" : "local time of the pass"} value={local.label} tone="text-amber" />}
            <div className="col-span-full flex flex-wrap items-center gap-2 text-[12px]"><Tag kind="OBSERVED" /><span className="text-muted">Cloud and rain: ERA5 reanalysis via Open-Meteo, at this location.</span></div>
          </div>
        </div>
      ))}

      {/* 2. RADAR */}
      {chapter("s-radar", () => (
        <div className="space-y-3">
          <Flipbook key={`${m.stack}-b`} m={m} big switchable fit="100svh - 380px" />
          <div className="grid gap-2 text-[13px] text-text/80 sm:grid-cols-3">
            <Legend swatch="bg-[#111]" title="Black" text="calm, open water" />
            <Legend swatch="bg-[#777]" title="Grey" text="fields, forest, rough ground" />
            <Legend swatch="bg-[#f2f2f2]" title="Bright white" text="water under trees, or buildings" />
            <div className="col-span-full flex flex-wrap items-center gap-2 text-[12px]"><Tag kind="OBSERVED" /><span className="text-muted">NISAR L2 GCOV, HH polarisation, {f.resM} m cells, read from NASA&apos;s ASF archive. Likely water: cyan = calm open water, amber = water under vegetation?</span></div>
          </div>
        </div>
      ))}

      {/* 3. HIDDEN WATER */}
      {chapter("s-water", (seen) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="most open water (one pass)" value={<><CountUp to={f.waterPeak.water_km2} active={seen} decimals={f.waterPeak.water_km2 < 10 ? 1 : 0} /> km²</>} tone="text-cyan"
              sub={relatable(f.waterPeak.water_km2) ?? undefined} />
            <Stat label="most hidden under vegetation" value={<><CountUp to={f.vegPeak.flooded_veg_km2} active={seen} decimals={f.vegPeak.flooded_veg_km2 < 10 ? 1 : 0} /> km²</>} tone="text-amber"
              sub={relatable(f.vegPeak.flooded_veg_km2) ?? undefined} />
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-muted">
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 bg-map-water" />looks like open water</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 bg-map-veg" />water hidden under vegetation?</span>
            </div>
            <div className="space-y-1.5">
              {f.passes.map((p, k) => (
                <div key={p.date} className="flex items-center gap-3 text-[12px]">
                  <span className="w-24 shrink-0 font-mono text-muted">{p.date}</span>
                  <div className="flex h-3.5 flex-1 overflow-hidden rounded bg-panel-2">
                    <div className="grow-bar h-full bg-map-water" style={{ width: `${(p.water_km2 / maxArea) * 100}%`, transform: `scaleX(${seen ? 1 : 0})`, transitionDelay: `${k * 110}ms` }} />
                    <div className="grow-bar h-full bg-map-veg" style={{ width: `${(p.flooded_veg_km2 / maxArea) * 100}%`, transform: `scaleX(${seen ? 1 : 0})`, transitionDelay: `${k * 110 + 60}ms` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-text">{fmtKm2(p.water_km2 + p.flooded_veg_km2)} km²</span>
                </div>
              ))}
            </div>
            <button onClick={() => { ensureSound(); setTimeout(() => storySound.playSeries(f.passes.map((p) => p.water_km2), 560, f.passes.map((p) => p.flooded_veg_km2)), 80); }}
              className="mt-3 flex items-center gap-1.5 rounded-md border border-accent/40 px-3 py-1.5 text-[13px] text-accent hover:bg-accent/10">
              <Music size={14} />Hear the water: one note per pass, higher = more water
            </button>
          </div>
          <div className="space-y-2">
            {f.partialPasses.length > 0 && (
              <p className="text-[12px] text-text/75">
                On {f.partialPasses.length} of {f.n} passes the satellite&apos;s strip covered only part of this area. To compare fairly, these numbers count only the
                {f.commonKm2 != null ? ` ${fmtKm2(f.commonKm2)} km² of` : ""} ground seen on every pass.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[12px]"><Tag kind="CALCULATED" /><Tag kind="INTERPRETED" />
              <span className="text-muted">Uncalibrated screening: the pattern and its timing, not surveyed flood extents. Manhattan (59 km²) and football pitches (0.7 ha) are for scale.</span></div>
          </div>
        </div>
      ))}

      {/* 4. TURNING POINT */}
      {f.biggest && chapter("s-change", (seen) => {
        const big = f.biggest!;
        const c = (big as unknown as { HH_change?: { frac_increase: number; frac_decrease: number } }).HH_change;
        const after = f.passes.find((p) => p.date === big.after);
        return (
          <div className="space-y-3">
            <figure className="mx-auto w-full" style={{ maxWidth: `calc((100svh - 360px) / ${m.display.ny / m.display.nx})` }}>
              <div className="relative overflow-hidden rounded-xl border border-line bg-void" style={{ paddingTop: `${(m.display.ny / m.display.nx) * 100}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img crossOrigin={IMG_CORS} src={imgUrl(m, `${big.before}_HH`)} alt="Radar before" className="absolute inset-0 h-full w-full object-contain opacity-40" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img crossOrigin={IMG_CORS} src={imgUrl(m, `d_${big.id}_HH`)} alt="Measured radar change" className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-[1800ms] ${seen ? "opacity-100" : "opacity-0"}`} />
              </div>
              <figcaption className="mt-1 text-center text-[12px] text-muted"><span className="text-amber">Amber</span> = grew brighter · <span className="text-blue">blue</span> = grew darker ({big.delta_days} days apart)</figcaption>
            </figure>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="of the ground grew clearly brighter" value={<><CountUp to={(c?.frac_increase ?? 0) * 100} active={seen} decimals={1} />%</>} tone="text-amber" />
              <Stat label="grew clearly darker" value={<><CountUp to={(c?.frac_decrease ?? 0) * 100} active={seen} decimals={1} />%</>} tone="text-blue" />
              {after?.rain7_mm != null && (
                <p className="col-span-full flex items-start gap-2 text-[13px] text-text/80"><CloudRain size={17} className="mt-0.5 shrink-0 text-blue" />
                  {after.rain7_mm.toFixed(0)} mm of rain in the 7 days before {fmtDate(big.after)}. Rain wets soil and leaves, which changes the radar too.</p>
              )}
              <div className="col-span-full flex flex-wrap items-center gap-2 text-[12px]"><Tag kind="CALCULATED" /><span className="text-muted">Share of {f.resM} m cells changing by ≥3 dB (twice as bright, or half).</span></div>
            </div>
          </div>
        );
      })}

      {/* 5. HOW SURE */}
      {chapter("s-sure", () => (
        <div className="space-y-4">
          <ul className="space-y-2">
            {(f.statements.length ? f.statements : [{ kind: "UNCONFIRMED" as const, text: "Loading the detailed evidence…" }]).map((s, k) => (
              <li key={k} className="story-line flex gap-3 text-[14px] leading-snug" style={{ animationDelay: `${k * 120}ms` }}>
                <span className="w-28 shrink-0 pt-0.5"><Tag kind={s.kind} /></span><span className="text-text/85">{s.text}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-line bg-panel p-4 text-[13px] text-text/85">
            <div className="flex items-center gap-2 font-semibold text-text"><ShieldCheck size={16} className="text-green" />Why you can trust this story</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Every image is a real NISAR acquisition from NASA&apos;s archive, dated to the second.</li>
              <li>All {f.n} passes come from the same orbit track and processing release, so they are fairly comparable.</li>
              <li>Pixels flagged as unreliable by NASA&apos;s own quality masks were removed.</li>
              <li>The narration is written from these numbers, and leaves out anything the data cannot support.</li>
            </ul>
          </div>
        </div>
      ))}

      {/* EPILOGUE */}
      {chapter("s-next", () => (
        <div className="flex flex-wrap gap-2">
          <button onClick={choose} className="flex items-center gap-1.5 rounded-full bg-amber px-5 py-2.5 text-sm font-semibold text-bg"><Globe2 size={15} />Choose your place</button>
          <button onClick={onOpenMap} className="flex items-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent/50"><MapIcon size={15} />Explore {f.place} on the map</button>
          {shareUrl && <button onClick={share} className="flex items-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent/50">{copied ? <Check size={15} /> : <Share2 size={15} />}{copied ? "Link copied" : "Share this story"}</button>}
          <button onClick={() => playFrom(0)} className="flex items-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm hover:border-amber/50"><Play size={15} />Watch it again</button>
        </div>
      ))}

      {/* subtitles */}
      {subs && caption && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
          <p key={caption} className="caption-in max-w-3xl rounded-lg bg-[#07080f]/85 px-4 py-2 text-center text-[15px] leading-snug text-white shadow-lg sm:text-[17px]">{caption}</p>
        </div>
      )}

      {/* player */}
      <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border border-line bg-bg/90 p-1 shadow-lg backdrop-blur">
        <button onClick={begin} aria-label={playing ? "Pause the story" : "Play the story"} title={playing ? "Pause" : "Play the story"}
          className="flex items-center gap-1.5 rounded-full bg-amber px-3 py-1.5 text-[12px] font-semibold text-bg">
          {playing ? <Pause size={14} /> : <Play size={14} />}<span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
        </button>
        {playing && (
          <button onClick={() => playFrom(Math.min(active + 1, script.length - 1))} aria-label="Next chapter" title="Next chapter"
            className="rounded-full p-1.5 text-muted hover:text-text"><SkipForward size={15} /></button>
        )}
        <button onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Turn all sound off" : "Turn sound on"} title={sound ? "Sound off" : "Sound on"}
          className={`rounded-full p-1.5 ${sound ? "text-accent" : "text-muted hover:text-text"}`}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
        {sound && <>
          <button onClick={toggleMusic} aria-pressed={music} aria-label="Music" title={music ? "Music on" : "Music off"}
            className={`rounded-full p-1.5 ${music ? "text-accent" : "text-muted line-through hover:text-text"}`}><Music size={15} /></button>
          <button onClick={toggleVoice} aria-pressed={voice} aria-label="Narrator voice" title={voice ? "Narrator on" : "Narrator off"}
            className={`rounded-full px-1.5 py-1 text-[11px] font-semibold ${voice ? "text-accent" : "text-muted line-through hover:text-text"}`}>VO</button>
        </>}
        <button onClick={() => setSubs((s) => !s)} aria-pressed={subs} aria-label="Subtitles" title={subs ? "Subtitles on" : "Subtitles off"}
          className={`rounded-full p-1.5 ${subs ? "text-accent" : "text-muted hover:text-text"}`}><Subtitles size={15} /></button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: React.ReactNode; tone: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5">
      <div className={`font-display text-2xl font-semibold xl:text-3xl ${tone}`}>{value}</div>
      <div className="mt-1 text-[13px] text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-[12px] text-text/70">{sub}</div>}
    </div>
  );
}

function Legend({ swatch, title, text }: { swatch: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-4 w-4 shrink-0 rounded border border-line ${swatch}`} />
      <div><b className="text-text">{title}:</b> {text}</div>
    </div>
  );
}
