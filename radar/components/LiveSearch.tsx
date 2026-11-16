"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, History, Loader2, MapPin, Play, RefreshCw, Search, Satellite, Zap } from "lucide-react";
import type { Manifest } from "@/lib/data";
import {
  ANALYSIS_OFFLINE, PUBLIC_DEMO_NOTE, Acquisitions, Detail, GalleryItem, Job, LiveStack, Place, acquisitions, backendHealth, errorText, gallery,
  geocode, job as getJob, loadResult, startAnalysis,
} from "@/lib/api";
import PublicDemoNote, { useIsPublicDemo } from "@/components/PublicDemoNote";
import ExamplePicker from "@/components/ExamplePicker";

export const MAT: Record<string, string> = {
  VALIDATED: "border-green/50 text-green bg-green/10",
  PROVISIONAL: "border-accent/50 text-accent bg-accent/10",
  URGENT_RESPONSE: "border-amber/50 text-amber bg-amber/10",
  BETA: "border-line text-muted",
  OTHER: "border-rose/40 text-rose bg-rose/5",
};
export const MAT_LABEL: Record<string, string> = { URGENT_RESPONSE: "URGENT RESPONSE" };
const SIZES = [10, 20, 40];
const fmtUtc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export interface LiveResult { manifest: Manifest; footprint: GeoJSON.Geometry | null; checkedUtc: string | null }

interface Props {
  onResult: (r: LiveResult) => void;
  active: boolean;
  /** A place chosen elsewhere (map click, newest-acquisitions feed). */
  externalPlace: (Place & { nonce: number }) | null;
}

export default function LiveSearch({ onResult, active, externalPlace }: Props) {
  const [backend, setBackend] = useState<{ ok: boolean; token: boolean } | null>(null);
  const demo = useIsPublicDemo();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [acq, setAcq] = useState<Acquisitions | null>(null);
  const [stackId, setStackId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [size, setSize] = useState(20);
  const [detail, setDetail] = useState<Detail>("standard");
  const [busy, setBusy] = useState<"geocode" | "search" | null>(null);
  const [jobState, setJobState] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<GalleryItem[]>([]);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0); // only the newest search may write its answer to the screen

  const refreshGallery = useCallback(() => { gallery().then(setRecent).catch(() => setRecent([])); }, []);
  /** Ask whether the backend is there (it may have been started or stopped since the page opened). */
  const checkBackend = useCallback(() => backendHealth(true).then((h) => {
    setBackend({ ok: !!h, token: !!h?.earthdata_token });
    return h;
  }), []);

  useEffect(() => {
    checkBackend().then(refreshGallery);
    return () => { if (poll.current) clearTimeout(poll.current); };
  }, [checkBackend, refreshGallery]);

  const stack = acq?.stacks.find((s) => s.id === stackId) ?? null;
  const running = !!jobState && (jobState.status === "queued" || jobState.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  function chooseStack(s: LiveStack) {
    setStackId(s.id);
    setPicked(s.usable ? s.granules.slice(-2).map((g) => g.scene) : []); // latest compatible pair
  }

  const pickPlace = useCallback(async (p: Place, fresh = false) => {
    const seq = ++searchSeq.current;
    if (poll.current) clearTimeout(poll.current); // a job for the previous place no longer reports here
    setPlace(p); setPlaces(null); setAcq(null); setStackId(null); setPicked([]); setJobState(null); setErr(null);
    setBusy("search");
    try {
      const a = await acquisitions(p.lat, p.lon, fresh);
      if (seq !== searchSeq.current) return;
      setAcq(a);
      const rec = a.stacks.find((s) => s.id === a.recommended_stack) ?? a.stacks.find((s) => s.usable);
      if (rec) { setStackId(rec.id); setPicked(rec.usable ? rec.granules.slice(-2).map((g) => g.scene) : []); }
    } catch (x) { if (seq === searchSeq.current) setErr(`The archive search did not finish. ${errorText(x)}`); }
    finally { if (seq === searchSeq.current) setBusy(null); }
  }, []);

  useEffect(() => {
    if (externalPlace) { setQ(externalPlace.name); pickPlace(externalPlace); }
  }, [externalPlace, pickPlace]);

  async function doGeocode(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    const seq = ++searchSeq.current;
    setErr(null); setBusy("geocode"); setPlaces(null);
    try {
      const r = await geocode(q);
      if (seq !== searchSeq.current) return;
      setPlaces(r);
      if (r.length === 1) await pickPlace(r[0]);
      else if (!r.length) setErr("No place found. Try another name, or type coordinates like 12.56, 104.21.");
    } catch (x) { if (seq === searchSeq.current) setErr(`The place search did not finish. ${errorText(x)}`); }
    finally { setBusy((b) => (b === "geocode" ? null : b)); }
  }

  function toggleDate(scene: string) {
    setPicked((p) => (p.includes(scene) ? p.filter((s) => s !== scene) : p.length >= 12 ? p : [...p, scene]));
  }

  async function openSaved(item: GalleryItem) {
    setErr(null);
    try {
      const m = await loadResult(item.result);
      onResult({ manifest: m, footprint: null, checkedUtc: null });
    } catch (x) { setErr(`Could not open saved result: ${(x as Error).message}`); }
  }

  async function analyze() {
    if (!place || !stack || picked.length < 2) return;
    setErr(null);
    const h = await checkBackend();
    if (!h) { setErr(demo ? PUBLIC_DEMO_NOTE : ANALYSIS_OFFLINE); return; }
    if (!h.earthdata_token) { setErr("The server has no Earthdata token (.earthdata_token), so it cannot read NASA's radar files yet."); return; }
    setStarted(Date.now()); setNow(Date.now());
    try {
      let j = await startAnalysis({ lat: place.lat, lon: place.lon, scenes: picked, size_km: size, detail,
        place: place.type && ["coordinates", "feed", "map"].includes(place.type) ? `${place.lat.toFixed(4)}°, ${place.lon.toFixed(4)}°` : place.name.split(",").slice(0, 2).join(",") });
      setJobState(j);
      const tick = async () => {
        if (j.status === "done" && j.result) {
          const m = await loadResult(j.result);
          onResult({ manifest: m, footprint: stack.footprint, checkedUtc: acq?.checked_utc ?? null });
          setJobState({ ...j, message: j.cached ? "Loaded saved result" : "Done" });
          refreshGallery();
          return;
        }
        if (j.status === "error") { setErr(j.message ?? "Analysis failed"); return; }
        poll.current = setTimeout(async () => {
          try { j = await getJob(j.job_id); setJobState(j); tick(); }
          catch (x) { setErr(x instanceof TypeError ? `Lost contact with the server during the analysis. ${errorText(x)}` : errorText(x)); }
        }, 700);
      };
      tick();
    } catch (x) { setErr(errorText(x)); }
  }

  const est = detail === "quick" ? 10 : 12 + Math.max(0, picked.length - 2) * 3;

  return (
    <div className={`rounded-lg border bg-panel p-4 sm:p-5 ${active ? "border-accent/50" : "border-line"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Satellite size={16} className="text-accent" /> Choose a place
      </div>
      <p className="mt-1 text-[12px] text-muted">
        Open a saved example, or search any place on Earth. DELTA PULSE asks NASA&apos;s archive what its NISAR radar has
        recorded there, then reads only the area you choose from the real radar files.
      </p>

      {backend && !backend.ok && demo && <div className="mt-3"><PublicDemoNote what="Analysing a new place needs the full app." /></div>}
      {backend && !backend.ok && !demo && (
        <div className="mt-3 flex gap-2 text-[13px] leading-relaxed text-amber" role="status">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            You can search any place and see what NISAR has recorded there, straight from NASA&apos;s archive. Analysing a new place
            is switched off in this copy of the app, because that needs our server, which reads the radar files with an Earthdata
            login. The worldwide examples below and the Tonle Sap case study open without it.
            {typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && (
              <span className="mt-1 block text-muted">Developers: in the radar folder run <code className="text-text">npm.cmd run api</code>, then reload.</span>
            )}
          </span>
        </div>
      )}
      {backend?.ok && !backend.token && (
        <div className="mt-3 rounded-md border border-amber/40 bg-amber/5 p-2 text-[12px] text-amber">
          Search works, but analysis needs an Earthdata token on the server (.earthdata_token).
        </div>
      )}
      <ExamplePicker onResult={onResult} label={backend && !backend.ok ? "Explore these places instead" : "Or open a ready-made example"} />

      <form onSubmit={doGeocode} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Manaus, Sundarbans, Jakarta, or 12.56, 104.21"
            aria-label="Place name or coordinates"
            className="w-full rounded-md border border-line bg-bg py-2 pr-3 pl-9 text-sm text-text focus:border-accent focus:outline-none" />
        </div>
        <button type="submit" disabled={busy !== null || q.trim().length < 2}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-40">
          {busy === "geocode" ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Search
        </button>
      </form>

      {places && places.length > 1 && (
        <ul className="mt-2 max-h-48 overflow-auto rounded-md border border-line">
          {places.map((p, i) => (
            <li key={`${i}-${p.lat},${p.lon}`}>
              <button onClick={() => pickPlace(p)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] hover:bg-panel-2">
                <MapPin size={13} className="mt-0.5 shrink-0 text-accent" />
                <span><span className="text-text">{p.name}</span><span className="ml-2 font-mono text-[11px] text-muted">{p.lat.toFixed(3)}, {p.lon.toFixed(3)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy === "geocode" && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted" role="status"><Loader2 size={14} className="animate-spin" />Looking for that place…</div>
      )}
      {busy === "search" && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted" role="status"><Loader2 size={14} className="animate-spin" />Searching the NISAR archive…</div>
      )}

      {acq && place && (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
            <div className="text-text"><MapPin size={12} className="mr-1 inline text-accent" />{place.name.split(",").slice(0, 3).join(",")}</div>
            <div className="flex items-center gap-2 text-muted">
              {acq.n_granules} GCOV granules · archive checked {fmtUtc(acq.checked_utc)}
              <button onClick={() => pickPlace(place, true)} title="Search the archive again now" className="text-accent hover:text-accent-strong"><RefreshCw size={12} /></button>
            </div>
          </div>
          {acq.note && <p className="mt-2 text-[13px] text-muted">{acq.note}</p>}

          <div className="mt-2 grid max-h-72 gap-1.5 overflow-auto pr-1">
            {acq.stacks.map((s) => (
              <button key={s.id} onClick={() => chooseStack(s)} disabled={!s.usable}
                title={s.usable ? s.caveat ?? undefined : "Pre-calibration or non-standard products are listed but not analysed"}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-[12px] ${s.id === stackId ? "border-accent bg-accent/10" : "border-line hover:border-accent/40"} disabled:cursor-not-allowed disabled:opacity-45`}>
                <span className="font-mono text-text">Track {s.track}{s.direction?.[0]} · frame {s.frame} · {s.bandwidth} MHz</span>
                <span className={`rounded border px-1.5 font-mono text-[11px] ${MAT[s.maturity] ?? MAT.OTHER}`}>{MAT_LABEL[s.maturity] ?? s.maturity} {s.crid}</span>
                <span className="text-muted">{s.n_dates === 1 ? `1 date · ${s.latest}` : `${s.n_dates} dates · ${s.dates[0]} → ${s.latest}`}</span>
                <span className="text-muted">{s.dual_pol_dates.length === s.n_dates ? "HH+HV" : s.dual_pol_dates.length === 0 ? `${s.granules[0]?.pols.join("+") || "HH"} only` :`HV on ${s.dual_pol_dates.length} of ${s.n_dates} dates`}</span>
                {s.id === acq.recommended_stack && <span className="ml-auto text-[11px] text-accent">latest compatible pair</span>}
                {s.usable && s.n_dates < 2 && <span className="ml-auto text-[11px] text-muted">needs a 2nd date to compare</span>}
              </button>
            ))}
          </div>

          {stack && stack.usable && (
            <div className="mt-3">
              {stack.caveat && stack.maturity === "URGENT_RESPONSE" && (
                <div className="mb-2 rounded-md border border-amber/40 bg-amber/5 p-2 text-[12px] text-amber">{stack.caveat}</div>
              )}
              <div className="mb-1.5 text-[12px] text-muted">
                Acquisitions to compare ({picked.length} selected · 2–12 · consecutive selected dates are paired):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stack.granules.map((g) => {
                  const on = picked.includes(g.scene);
                  return (
                    <button key={g.scene} onClick={() => toggleDate(g.scene)} title={`${g.scene}\n${g.pols.join("+")}`}
                      className={`rounded border px-2 py-1 font-mono text-[11px] ${on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-text"}`}>
                      {g.date}{!g.pols.includes("HV") && <span className="ml-1 text-amber">HH</span>}
                    </button>
                  );
                })}
                {stack.granules.length > 2 && (
                  <button onClick={() => setPicked(stack.granules.slice(-Math.min(12, stack.granules.length)).map((g) => g.scene))}
                    className="rounded border border-dashed border-line px-2 py-1 text-[12px] text-muted hover:text-text">select all (max 12)</button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex overflow-hidden rounded-md border border-line text-[12px]" role="group" aria-label="Detail">
                  <button onClick={() => setDetail("quick")} title="5 MHz side band, 80 m cells, fastest"
                    className={`flex items-center gap-1 px-3 py-1.5 ${detail === "quick" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}><Zap size={12} />Quick 80 m</button>
                  <button onClick={() => setDetail("standard")} title="Main band, 40 m cells (20 km window)"
                    className={`px-3 py-1.5 ${detail === "standard" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>Detailed 40 m</button>
                </div>
                <div className="flex overflow-hidden rounded-md border border-line text-[12px]" role="group" aria-label="Window size">
                  {SIZES.map((k) => (
                    <button key={k} onClick={() => setSize(k)}
                      className={`px-3 py-1.5 ${size === k ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>{k} km</button>
                  ))}
                </div>
                <button onClick={analyze} disabled={picked.length < 2 || running}
                  title={picked.length < 2 ? "Pick at least two dates to compare" : undefined}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-on-accent disabled:opacity-40">
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Analyse {picked.length} acquisition{picked.length === 1 ? "" : "s"}
                </button>
                <span className="text-[12px] text-muted">≈ {est}–{est * 2} s</span>
              </div>
            </div>
          )}
        </div>
      )}

      {jobState && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded bg-panel-2" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((jobState.status === "done" ? 1 : jobState.progress ?? 0) * 100)}>
            <div className="h-full origin-left bg-accent transition-transform duration-500 ease-out" style={{ transform: `scaleX(${jobState.status === "done" ? 1 : jobState.progress ?? 0})` }} />
          </div>
          <div className="mt-1 flex justify-between text-[12px] text-muted">
            <span>{jobState.status === "error" ? "" : jobState.message}</span>
            {running && started && <span className="font-mono">{Math.max(0, Math.round((now - started) / 1000))} s</span>}
          </div>
        </div>
      )}
      {err && (
        <div className="mt-3 flex gap-2 rounded-md border border-rose/40 bg-rose/5 p-2 text-[12px] text-rose">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}
        </div>
      )}

      {recent.length > 0 && (
        <details className="mt-4 text-[12px]">
          <summary className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-text"><History size={13} />Recent analyses ({recent.length}) open instantly</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {recent.map((r) => (
              <li key={r.id}>
                <button onClick={() => openSaved(r)} className="w-full rounded-md border border-line px-2.5 py-1.5 text-left hover:border-accent/40">
                  <div className="truncate text-text">{r.name}</div>
                  <div className="font-mono text-[11px] text-muted">{r.n_obs} dates · {r.first} → {r.last} · {r.detail === "quick" ? "80 m" : `${r.size_km} km`} · {MAT_LABEL[r.maturity] ?? r.maturity}</div>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
