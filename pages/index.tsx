// pages/index.tsx
import React, { useEffect, useRef, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────────
   Device profiles (illustrative; *not* manufacturer specs)
   anchors: attenuation in dB vs frequency (negative = cut, positive = boost)
   mono: 0..1  (0 = full stereo, 1 = hard mono collapse)
───────────────────────────────────────────────────────────────────────────────*/
type DeviceKey =
  | "flat"
  | "iphone14pm_approx"
  | "airpods_pro_approx"
  | "samsung_tv_approx"
  | "car_speakers_approx"
  | "laptop_approx";

const DEVICE_PROFILES: Record<
  DeviceKey,
  { label: string; anchors: Array<{ f: number; db: number }>; mono: number }
> = {
  flat: {
    label: "Flat / Studio Monitors",
    anchors: [{ f: 20, db: 0 }, { f: 20000, db: 0 }],
    mono: 0,
  },
  iphone14pm_approx: {
    label: "iPhone speaker (approx.)",
    anchors: [
      { f: 20, db: -60 }, { f: 50, db: -35 }, { f: 80, db: -25 }, { f: 100, db: -20 },
      { f: 150, db: -14 }, { f: 200, db: -10 }, { f: 300, db: -6 },  { f: 500, db: -3 },
      { f: 1000, db: 0 },  { f: 2000, db: -1 }, { f: 4000, db: -2 }, { f: 8000, db: -6 },
      { f: 12000, db: -10 }, { f: 16000, db: -14 }, { f: 20000, db: -20 },
    ],
    mono: 0.85,
  },
  airpods_pro_approx: {
    label: "AirPods Pro (approx.)",
    anchors: [
      { f: 20, db: -10 }, { f: 40, db: -6 }, { f: 80, db: -3 }, { f: 120, db: -2 },
      { f: 250, db: -1 }, { f: 500, db: 0 }, { f: 1000, db: 0 }, { f: 3000, db: 2 },
      { f: 6000, db: 1 }, { f: 10000, db: 0 }, { f: 15000, db: -2 }, { f: 20000, db: -4 },
    ],
    mono: 0,
  },
  samsung_tv_approx: {
    label: "Samsung TV (approx.)",
    anchors: [
      { f: 20, db: -44 }, { f: 50, db: -32 }, { f: 80, db: -24 }, { f: 100, db: -18 },
      { f: 150, db: -12 }, { f: 200, db: -10 }, { f: 300, db: -8 },  { f: 500, db: -6 },
      { f: 1000, db: -4 }, { f: 2000, db: -2 }, { f: 4000, db: 0 },  { f: 8000, db: -3 },
      { f: 12000, db: -6 }, { f: 16000, db: -10 }, { f: 20000, db: -14 },
    ],
    mono: 0.6,
  },
  car_speakers_approx: {
    label: "Car speakers (typical)",
    anchors: [
      { f: 20, db: -24 }, { f: 40, db: -15 }, { f: 60, db: -10 }, { f: 80, db: -6 },
      { f: 100, db: -4 }, { f: 200, db: -2 }, { f: 500, db: 0 },  { f: 1000, db: 0 },
      { f: 2000, db: 1 },  { f: 4000, db: 0 },  { f: 8000, db: -2 }, { f: 12000, db: -6 },
      { f: 16000, db: -10 }, { f: 20000, db: -14 },
    ],
    mono: 0.1,
  },
  laptop_approx: {
    label: "Laptop speaker (approx.)",
    anchors: [
      { f: 20, db: -48 }, { f: 80, db: -28 }, { f: 120, db: -16 }, { f: 200, db: -8 },
      { f: 500, db: -3 }, { f: 1000, db: 0 }, { f: 5000, db: -3 }, { f: 10000, db: -8 },
      { f: 16000, db: -14 }, { f: 20000, db: -20 },
    ],
    mono: 0.7,
  },
};

/* ──────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────────*/
function interpDbLog(f: number, anchors: Array<{ f: number; db: number }>) {
  if (f <= anchors[0].f) return anchors[0].db;
  const last = anchors[anchors.length - 1];
  if (f >= last.f) return last.db;
  const lf = Math.log10(f);
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (f >= a.f && f <= b.f) {
      const t = (lf - Math.log10(a.f)) / (Math.log10(b.f) - Math.log10(a.f));
      return a.db + (b.db - a.db) * t;
    }
  }
  return last.db;
}

function avgAttDb(anchors: Array<{ f: number; db: number }>) {
  const pts = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
  let sum = 0;
  for (const f of pts) sum += interpDbLog(f, anchors);
  return sum / pts.length;
}

/* ──────────────────────────────────────────────────────────────────────────────
   Page Component
───────────────────────────────────────────────────────────────────────────────*/
export default function Home() {
  // UI state
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [deviceKey, setDeviceKey] = useState<DeviceKey>("iphone14pm_approx");
  const [cutDb, setCutDb] = useState(12);
  const [bypass, setBypass] = useState(false);

  // DOM refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const specRef = useRef<HTMLCanvasElement | null>(null);
  const stereoRef = useRef<HTMLCanvasElement | null>(null);

  // audio graph refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserMixRef = useRef<AnalyserNode | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const filtersRef = useRef<AudioNode[]>([]);
  const rafIdRef = useRef<number>(0);
  const prevDbRef = useRef<Float32Array | null>(null);

  // live values used by draw loop
  const deviceKeyRef = useRef(deviceKey);
  const bypassRef = useRef(bypass);
  const cutDbRef = useRef(cutDb);
  useEffect(() => { deviceKeyRef.current = deviceKey; }, [deviceKey]);
  useEffect(() => { bypassRef.current = bypass; }, [bypass]);
  useEffect(() => { cutDbRef.current = cutDb; }, [cutDb]);

  // viz knobs
  const minDb = -90, maxDb = -10;
  const fftSize = 16384;               // high resolution for smoothness
  const analyserSmoothing = 0.93;
  const crossFrameAlpha = 0.82;
  const minHz = 20, maxHz = 20000;
  const cssHeight = 360;

  // ── player helpers (for hero UI) ────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onLoaded = () => setDur(a.duration || 0);
    const onTime   = () => setPos(a.currentTime || 0);
    const onPlay   = () => setIsPlaying(true);
    const onPause  = () => setIsPlaying(false);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);
  const fmt = (t: number) => !Number.isFinite(t) ? "0:00" : `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,"0")}`;
  const togglePlay = () => { const a = audioRef.current; if (!a) return; a.paused ? a.play() : a.pause(); };
  const seek = (v: number) => { const a = audioRef.current; if (!a) return; a.currentTime = v; setPos(v); };

  // ── inline styles to match the mock (Orbit-like) ────────────────────────────
  const UI = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(1200px 600px at 10% -10%, #ffeef3 0%, transparent 55%)," +
        "radial-gradient(1200px 600px at 90% -10%, #eef0ff 0%, transparent 55%), #eef1f7",
      color: "#0f1222",
      padding: 24,
    } as React.CSSProperties,
    wrap: { maxWidth: 1200, margin: "0 auto" },
    hero: {
      position: "relative",
      padding: 32,
      background: "linear-gradient(180deg, #ffffffcc, #ffffffa6), #f7f8fb",
      borderRadius: 24,
      border: "1px solid #fff",
      boxShadow: "0 12px 60px rgba(119,92,255,.18), 0 24px 80px rgba(15,18,34,.10)",
      overflow: "hidden",
      marginBottom: 24,
    } as React.CSSProperties,
    phoneDeco: {
      position: "absolute" as const,
      right: 40, top: 40, width: 260, height: 160,
      transform: "rotate(28deg)", borderRadius: 28, background: "#e9ecf6",
      boxShadow: "inset 0 3px 0 #fff, 0 18px 48px rgba(15,18,34,.15)",
    },
    chip: (active: boolean): React.CSSProperties => ({
      width: 48, height: 48, display: "grid", placeItems: "center",
      borderRadius: 16, cursor: "pointer",
      background: active ? "linear-gradient(180deg, #775cff, #a98cff)" : "#fff",
      color: active ? "#fff" : "#0f1222",
      border: "1px solid rgba(15,18,34,.08)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.9), inset 0 -8px 24px rgba(15,18,34,.06)",
    }),
    btn: {
      padding: "8px 12px",
      borderRadius: 14,
      background: "#fff",
      border: "1px solid rgba(15,18,34,.08)",
      cursor: "pointer",
    } as React.CSSProperties,
    grid: { display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 24 } as React.CSSProperties,
    panel: (outlineBrand = false): React.CSSProperties => ({
      background: "#fff",
      borderRadius: 18,
      border: "1px solid rgba(15,18,34,.06)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,.9), inset 0 -8px 24px rgba(15,18,34,.06)," +
        "0 12px 60px rgba(119,92,255,.08), 0 24px 80px rgba(15,18,34,.06)",
      padding: 12,
      ...(outlineBrand ? { boxShadow: "0 0 0 3px #775cff inset" } : {}),
    }),
  };

  useEffect(() => { setMounted(true); }, []);

  // ── INIT audio + canvases ───────────────────────────────────────────────────
  useEffect(() => {
    if (!audioRef.current || !specRef.current || !stereoRef.current) return;
    if (audioCtxRef.current) return; // prevent double init

    // @ts-ignore
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac: AudioContext = new AC();
    audioCtxRef.current = ac;

    // analysers
    const analyserMix = ac.createAnalyser();
    analyserMix.fftSize = fftSize;
    analyserMix.smoothingTimeConstant = analyserSmoothing;
    analyserMix.minDecibels = minDb;
    analyserMix.maxDecibels = maxDb;
    analyserMixRef.current = analyserMix;

    const analyserL = ac.createAnalyser();
    const analyserR = ac.createAnalyser();
    analyserL.fftSize = 2048;
    analyserR.fftSize = 2048;
    analyserL.smoothingTimeConstant = 0.85;
    analyserR.smoothingTimeConstant = 0.85;
    analyserLRef.current = analyserL; analyserRRef.current = analyserR;

    const outGain = ac.createGain(); outGainRef.current = outGain;

    if (!sourceRef.current) {
      sourceRef.current = ac.createMediaElementSource(audioRef.current);
    }

    const splitter = ac.createChannelSplitter(2);
    splitterRef.current = splitter;

    // taps for visuals
    sourceRef.current.connect(analyserMix);
    sourceRef.current.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    // resume on user gesture
    const ensureResumed = async () => { try { if (ac.state === "suspended") await ac.resume(); } catch {} };
    const onPointer = () => ensureResumed();
    window.addEventListener("pointerdown", onPointer, { passive: true });

    // canvases
    const specCanvas = specRef.current!;
    const specCtx = specCanvas.getContext("2d")!;
    const stereoCanvas = stereoRef.current!;
    const stereoCtx = stereoCanvas.getContext("2d")!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const resize = () => {
      const w1 = specCanvas.clientWidth || 1100;
      specCanvas.width = Math.floor(w1 * dpr);
      specCanvas.height = Math.floor(cssHeight * dpr);
      specCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w2 = stereoCanvas.clientWidth || 1100;
      const stereoH = 380;
      stereoCanvas.width = Math.floor(w2 * dpr);
      stereoCanvas.height = Math.floor(stereoH * dpr);
      stereoCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    // helpers
    const mixData = new Float32Array(analyserMix.frequencyBinCount);
    const sr = ac.sampleRate;
    const widthPx = (cv: HTMLCanvasElement) => Math.max(320, Math.floor(cv.width / dpr));

    const hzToX = (hz: number, w: number) => {
      const logMin = Math.log10(minHz), logMax = Math.log10(maxHz);
      return ((Math.log10(Math.max(hz, minHz)) - logMin) / (logMax - logMin)) * w;
    };
    const xToHz = (x: number, w: number) => {
      const logMin = Math.log10(minHz), logMax = Math.log10(maxHz);
      return Math.pow(10, logMin + (x / Math.max(1, w)) * (logMax - logMin));
    };
    const dbClamp = (db: number) => Math.max(minDb, Math.min(maxDb, Number.isFinite(db) ? db : minDb));
    const dbToY = (db: number, h: number) => ((dbClamp(db) - maxDb) / (minDb - maxDb)) * h;

    function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.07)";
      ctx.fillStyle = "rgba(15,18,34,0.55)";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";

      const vLines = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000];
      vLines.forEach((f) => {
        const x = Math.round(hzToX(f, w)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      });
      const labels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      labels.forEach((f) => {
        const x = Math.round(hzToX(f, w)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 4, h - 6);
      });
      const dbLines = [-10, -20, -30, -40, -50, -60, -70, -80, -90];
      dbLines.forEach((d) => {
        const y = Math.round(dbToY(d, h)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.fillText(`${d} dB`, 6, y - 4);
      });

      ctx.restore();
    }

    // ── DRAW LOOP ──────────────────────────────────────────────────────────────
    const draw = () => {
      // ===== Spectrum (top) =====
      analyserMix.getFloatFrequencyData(mixData);

      const W = widthPx(specCanvas);
      const H = Math.floor(specCanvas.height / dpr);

      specCtx.fillStyle = "#f7f8fb";
      specCtx.fillRect(0, 0, W, H);
      drawGrid(specCtx, W, H);

      // sample per pixel (log-x) with linear interpolation
      const dbRaw = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        const hz = xToHz(x, W);
        const idxF = (hz * analyserMix.fftSize) / sr;
        const i0 = Math.max(0, Math.min(mixData.length - 2, Math.floor(idxF)));
        const t = idxF - i0;
        const a = dbClamp(mixData[i0]);
        const b = dbClamp(mixData[i0 + 1]);
        dbRaw[x] = a + (b - a) * t;
      }
      // spatial MA
      const dbSpatial = new Float32Array(W);
      for (let i = 0; i < W; i++) {
        let s = 0, c = 0;
        for (let k = -4; k <= 4; k++) { const j = Math.min(W - 1, Math.max(0, i + k)); s += dbRaw[j]; c++; }
        dbSpatial[i] = s / c;
      }
      // cross-frame EMA
      if (!prevDbRef.current) prevDbRef.current = dbSpatial.slice();
      const dbSmooth = new Float32Array(W);
      const prev = prevDbRef.current!;
      for (let i = 0; i < W; i++) dbSmooth[i] = crossFrameAlpha * prev[i] + (1 - crossFrameAlpha) * dbSpatial[i];
      prevDbRef.current = dbSmooth;

      // device overlay curve (visual only)
      const profile = DEVICE_PROFILES[deviceKeyRef.current];
      const deviceDb = new Float32Array(W);
      const attenDb = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        const hz = xToHz(x, W);
        const att = interpDbLog(hz, profile.anchors);
        attenDb[x] = att;
        deviceDb[x] = dbSmooth[x] + att;
      }

      // original curve + fill (white)
      let px = 0, py = dbToY(dbSmooth[0], H);
      specCtx.beginPath(); specCtx.moveTo(0, py);
      for (let x = 1; x < W; x++) { const y = dbToY(dbSmooth[x], H); const cx = (px + x) / 2, cy = (py + y) / 2; specCtx.quadraticCurveTo(px, py, cx, cy); px = x; py = y; }
      specCtx.strokeStyle = "#111"; specCtx.lineWidth = 2; specCtx.stroke();
      specCtx.lineTo(W, H); specCtx.lineTo(0, H); specCtx.closePath(); specCtx.fillStyle = "rgba(0,0,0,0.06)"; specCtx.fill();

      // device curve (yellow)
      px = 0; py = dbToY(deviceDb[0], H);
      specCtx.beginPath(); specCtx.moveTo(0, py);
      for (let x = 1; x < W; x++) { const y = dbToY(deviceDb[x], H); const cx = (px + x) / 2, cy = (py + y) / 2; specCtx.quadraticCurveTo(px, py, cx, cy); px = x; py = y; }
      specCtx.strokeStyle = "#ffd54a"; specCtx.lineWidth = 2; specCtx.stroke();

      // cutoff shading (yellow) per pixel
      if (!bypassRef.current && deviceKeyRef.current !== "flat") {
        const th = cutDbRef.current;
        specCtx.fillStyle = "rgba(255,213,74,0.20)";
        for (let x = 0; x < W; x++) {
          const diff = -attenDb[x]; // how many dB lost
          if (diff >= th) {
            const y1 = dbToY(dbSmooth[x], H);
            const y2 = dbToY(deviceDb[x], H);
            specCtx.fillRect(x, Math.min(y1, y2), 1, Math.abs(y2 - y1));
          }
        }
      }

      // ===== Stereo Field (bottom) =====
      const AL = analyserLRef.current!, AR = analyserRRef.current!;
      const n = AL.fftSize;
      const timeL = new Float32Array(n);
      const timeR = new Float32Array(n);
      AL.getFloatTimeDomainData(timeL);
      AR.getFloatTimeDomainData(timeR);

      const SW = widthPx(stereoCanvas);
      const SH = Math.floor(stereoCanvas.height / dpr);
      const cx0 = Math.floor(SW / 2);
      const cy0 = SH - 20;                  // origin at bottom-center
      const Rmax = Math.min(SW, SH * 2) * 0.42;

      // background + grid
      stereoCtx.fillStyle = "#f7f8fb";
      stereoCtx.fillRect(0, 0, SW, SH);
      stereoCtx.save();
      stereoCtx.strokeStyle = "rgba(0,0,0,0.07)";
      stereoCtx.lineWidth = 1;
      for (let r = 0.25; r <= 1.0; r += 0.25) {
        stereoCtx.beginPath();
        stereoCtx.arc(cx0, cy0, Rmax * r, Math.PI, 0);
        stereoCtx.stroke();
      }
      [-60, -30, 0, 30, 60].forEach((deg) => {
        const rad = (Math.PI / 180) * deg;
        const x = cx0 + Rmax * Math.cos(Math.PI / 2 - rad);
        const y = cy0 - Rmax * Math.sin(Math.PI / 2 - rad);
        stereoCtx.beginPath();
        stereoCtx.moveTo(cx0, cy0);
        stereoCtx.lineTo(x, y);
        stereoCtx.stroke();
      });
      stereoCtx.restore();

      // histograms for outlines + sparkle
      const BINS = 181;
      const histO = new Float32Array(BINS);
      const histD = new Float32Array(BINS);

      // device stereo params
      const prof = DEVICE_PROFILES[deviceKeyRef.current];
      const mono = bypassRef.current || deviceKeyRef.current === "flat" ? 0 : prof.mono;
      const avgDb = avgAttDb(prof.anchors);
      const avgLin = Math.pow(10, avgDb / 20);

      // plot sparkles and collect hist
      const STEP = 1;
      for (let i = 0; i < n; i += STEP) {
        const L = timeL[i], R = timeR[i];

        // original
        let ang = Math.atan2(R, L);
        ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ang));
        let r = Math.min(1, Math.sqrt(L * L + R * R));
        let bin = Math.min(BINS - 1, Math.max(0, Math.floor(((ang + Math.PI / 2) / Math.PI) * (BINS - 1))));
        histO[bin] += r;

        // device (mono collapse + avg level)
        const Ld = avgLin * ((1 - mono / 2) * L + (mono / 2) * R);
        const Rd = avgLin * ((1 - mono / 2) * R + (mono / 2) * L);
        let angD = Math.atan2(Rd, Ld);
        angD = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angD));
        let rD = Math.min(1, Math.sqrt(Ld * Ld + Rd * Rd));
        let binD = Math.min(BINS - 1, Math.max(0, Math.floor(((angD + Math.PI / 2) / Math.PI) * (BINS - 1))));
        histD[binD] += rD;

        // sparse sparkle points
        if ((i & 7) === 0) {
          const plot = (a: number, radius: number, color: string, alpha = 0.6) => {
            const x = cx0 + Rmax * radius * Math.cos(Math.PI / 2 - a);
            const y = cy0 - Rmax * radius * Math.sin(Math.PI / 2 - a);
            stereoCtx.globalAlpha = alpha; stereoCtx.fillStyle = color;
            stereoCtx.fillRect(x, y, 1.25, 1.25);
          };
          plot(ang, r, "#111", 0.35);
          plot(angD, rD, "#ffd54a", 0.6);
        }
      }

      // smooth + normalize outline
      const smoothNorm = (src: Float32Array) => {
        const out = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) {
          let s = 0, c = 0;
          for (let k = -2; k <= 2; k++) { const j = Math.min(src.length - 1, Math.max(0, i + k)); s += src[j]; c++; }
          out[i] = s / c;
        }
        let m = 1e-6; for (const v of out) m = Math.max(m, v);
        for (let i = 0; i < out.length; i++) out[i] /= m;
        return out;
      };
      const rO = smoothNorm(histO);
      const rD = smoothNorm(histD);

      // outlines
      stereoCtx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const t = i / (BINS - 1), a = -Math.PI / 2 + t * Math.PI;
        const x = cx0 + Rmax * rO[i] * Math.cos(Math.PI / 2 - a);
        const y = cy0 - Rmax * rO[i] * Math.sin(Math.PI / 2 - a);
        if (i === 0) stereoCtx.moveTo(x, y); else stereoCtx.lineTo(x, y);
      }
      stereoCtx.strokeStyle = "#111"; stereoCtx.lineWidth = 2; stereoCtx.stroke();

      stereoCtx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const t = i / (BINS - 1), a = -Math.PI / 2 + t * Math.PI;
        const x = cx0 + Rmax * rD[i] * Math.cos(Math.PI / 2 - a);
        const y = cy0 - Rmax * rD[i] * Math.sin(Math.PI / 2 - a);
        if (i === 0) stereoCtx.moveTo(x, y); else stereoCtx.lineTo(x, y);
      }
      stereoCtx.strokeStyle = "#ffd54a"; stereoCtx.lineWidth = 2; stereoCtx.stroke();

      // shaded angles where device loses ≥ threshold (r ratio)
      if (!bypassRef.current && deviceKeyRef.current !== "flat") {
        const ratioTh = Math.pow(10, -cutDbRef.current / 20);
        stereoCtx.fillStyle = "rgba(255,213,74,0.20)";
        let i = 0;
        while (i < BINS) {
          while (i < BINS && !(rD[i] <= rO[i] * ratioTh)) i++;
          if (i >= BINS) break;
          const start = i;
          while (i < BINS && rD[i] <= rO[i] * ratioTh) i++;
          const end = i - 1;

          stereoCtx.beginPath();
          for (let j = start; j <= end; j++) {
            const t = j / (BINS - 1), a = -Math.PI / 2 + t * Math.PI;
            const x = cx0 + Rmax * rO[j] * Math.cos(Math.PI / 2 - a);
            const y = cy0 - Rmax * rO[j] * Math.sin(Math.PI / 2 - a);
            if (j === start) stereoCtx.moveTo(x, y); else stereoCtx.lineTo(x, y);
          }
          for (let j = end; j >= start; j--) {
            const t = j / (BINS - 1), a = -Math.PI / 2 + t * Math.PI;
            const x = cx0 + Rmax * rD[j] * Math.cos(Math.PI / 2 - a);
            const y = cy0 - Rmax * rD[j] * Math.sin(Math.PI / 2 - a);
            stereoCtx.lineTo(x, y);
          }
          stereoCtx.closePath();
          stereoCtx.fill();
        }
      }

      rafIdRef.current = requestAnimationFrame(draw);
    };

    rafIdRef.current = requestAnimationFrame(draw);

    // cleanup
    return () => {
      cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onPointer as any);
      try {
        sourceRef.current?.disconnect();
        analyserMixRef.current?.disconnect();
        analyserLRef.current?.disconnect();
        analyserRRef.current?.disconnect();
        splitterRef.current?.disconnect();
        outGainRef.current?.disconnect();
        filtersRef.current.forEach((n) => (n as any)?.disconnect?.());
      } catch {}
      ac.close().catch(() => {});
      audioCtxRef.current = null;
      sourceRef.current = null;
      analyserMixRef.current = null;
      analyserLRef.current = null;
      analyserRRef.current = null;
      splitterRef.current = null;
      outGainRef.current = null;
      filtersRef.current = [];
      prevDbRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // set audio src & play when file chosen
  useEffect(() => {
    if (!file || !audioRef.current) return;
    const url = URL.createObjectURL(file);
    audioRef.current.src = url;
    audioCtxRef.current?.resume().catch(() => {});
    audioRef.current.play().catch(() => {});
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // rebuild output chain when device/bypass change
  useEffect(() => {
    const ac = audioCtxRef.current;
    const src = sourceRef.current;
    const analyserMix = analyserMixRef.current;
    const splitter = splitterRef.current;
    const outGain = outGainRef.current;
    if (!ac || !src || !analyserMix || !splitter || !outGain) return;

    // disconnect previous
    try { src.disconnect(); } catch {}
    try { analyserMix.disconnect(); } catch {}
    try { splitter.disconnect(); } catch {}
    try { outGain.disconnect(); } catch {}
    filtersRef.current.forEach((n) => { try { (n as any).disconnect?.(); } catch {} });
    filtersRef.current = [];

    // visuals taps (always)
    src.connect(analyserMix);
    src.connect(splitter);
    splitter.connect(analyserLRef.current!, 0);
    splitter.connect(analyserRRef.current!, 1);

    const profile = DEVICE_PROFILES[deviceKey];
    const mono = bypass || deviceKey === "flat" ? 0 : profile.mono;

    if (bypass || deviceKey === "flat") {
      src.connect(outGain);
      outGain.connect(ac.destination);
    } else {
      // gentle multi-band approximation of the profile
      const filters: BiquadFilterNode[] = [];
      const lowShelf = ac.createBiquadFilter();
      lowShelf.type = "lowshelf"; lowShelf.frequency.value = 80;
      lowShelf.gain.value = interpDbLog(80, profile.anchors);
      filters.push(lowShelf);

      const bandCenters = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      bandCenters.forEach((f) => {
        const peak = ac.createBiquadFilter();
        peak.type = "peaking"; peak.frequency.value = f; peak.Q.value = 1.0;
        peak.gain.value = interpDbLog(f, profile.anchors);
        filters.push(peak);
      });

      const highShelf = ac.createBiquadFilter();
      highShelf.type = "highshelf"; highShelf.frequency.value = 12000;
      highShelf.gain.value = interpDbLog(12000, profile.anchors);
      filters.push(highShelf);

      // clamp boosts/cuts to sane range
      filters.forEach((n) => (n.gain.value = Math.max(-24, Math.min(12, n.gain.value))));

      // connect src -> filters...
      let prev: AudioNode = src;
      for (const f of filters) { prev.connect(f); prev = f; }

      // stereo collapse matrix if needed
      if (mono > 0.001) {
        const split = ac.createChannelSplitter(2);
        const merge = ac.createChannelMerger(2);
        const gLL = ac.createGain(); gLL.gain.value = 1 - mono / 2;
        const gLR = ac.createGain(); gLR.gain.value = mono / 2;
        const gRL = ac.createGain(); gRL.gain.value = mono / 2;
        const gRR = ac.createGain(); gRR.gain.value = 1 - mono / 2;

        prev.connect(split);
        split.connect(gLL, 0);
        split.connect(gRL, 0);
        split.connect(gLR, 1);
        split.connect(gRR, 1);

        gLL.connect(merge, 0, 0);
        gLR.connect(merge, 0, 0);
        gRL.connect(merge, 0, 1);
        gRR.connect(merge, 0, 1);

        merge.connect(outGain);
        outGain.connect(ac.destination);

        filtersRef.current = [...filters, split, merge, gLL, gLR, gRL, gRR];
      } else {
        prev.connect(outGain);
        outGain.connect(ac.destination);
        filtersRef.current = [...filters];
      }
    }

    audioRef.current?.play().catch(() => {});
  }, [deviceKey, bypass]);
if (!mounted) return null;
  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="orbit-bg" style={UI.page}>
      <div style={UI.wrap}>

        {/* HERO CARD */}
        <div style={UI.hero} className="orbit-surface">
          <div style={UI.phoneDeco} />

          {/* player + chips */}
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <button onClick={togglePlay} style={UI.chip(isPlaying)} aria-label="play/pause">
                {isPlaying ? "⏸" : "▶️"}
              </button>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>in the void mix v5.aiff</div>

                {/* slider styles */}
                <style>{`
                  .orbit-range{ -webkit-appearance:none; appearance:none; height:8px;
                    background: linear-gradient(90deg, #775cff, #a98cff); border-radius:999px;
                    box-shadow: inset 0 2px 8px rgba(15,18,34,.18); width:100%;
                  }
                  .orbit-range::-webkit-slider-thumb{ -webkit-appearance:none; width:22px; height:22px; border-radius:50%;
                    background:#fff; border:3px solid #775cff; box-shadow:0 6px 18px rgba(119,92,255,.35);
                  }
                  .orbit-range::-moz-range-thumb{ width:22px; height:22px; border-radius:50%;
                    background:#fff; border:3px solid #775cff;
                  }
                `}</style>

                <input
                  className="orbit-range"
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(dur))}
                  value={Math.floor(pos)}
                  onChange={(e) => seek(Number(e.target.value))}
                />

                <div style={{ display: "flex", justifyContent: "space-between", color: "#8e95a7", fontSize: 12, marginTop: 6 }}>
                  <span>{fmt(pos)}</span><span>{fmt(dur)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
              {[
                { k: "iphone14pm_approx", icon: "📱", label: "iPhone" },
                { k: "car_speakers_approx", icon: "🚗", label: "Car" },
                { k: "samsung_tv_approx",   icon: "📺", label: "TV" },
                { k: "airpods_pro_approx",  icon: "🎧", label: "AirPods" },
              ].map((d) => (
                <button
                  key={d.k}
                  onClick={() => setDeviceKey(d.k as DeviceKey)}
                  style={UI.chip(deviceKey === (d.k as DeviceKey))}
                  title={d.label}
                  className="orbit-button"
  data-active={deviceKey === d.key}   // 按你项目真实变量
  onClick={() => setDeviceKey(d.key)} // 按你项目真实函数
                >
                  <span style={{ fontSize: 20 }}>{d.icon}</span>
                </button>
              ))}
            </div>

            <div style={{ color: "#8e95a7", fontSize: 12, marginTop: 10 }}>
              Listening with{" "}
              <strong>
                {deviceKey.includes("iphone") ? "iPhone speaker" :
                 deviceKey.includes("airpods") ? "AirPods Pro" :
                 deviceKey.includes("samsung") ? "Samsung TV" :
                 deviceKey.includes("car") ? "car speakers" : "studio monitors"}
              </strong>
            </div>
          </div>

          {/* hidden audio element (WebAudio source) */}
          <audio ref={audioRef} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />

          {/* file picker (top-left) */}
          <div style={{ position: "absolute", left: 24, top: 24 }}>
            <label style={UI.btn}>
              Choose file
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              />
            </label>
          </div>

          {/* bypass + threshold (bottom-right) */}
          <div style={{ position: "absolute", right: 24, bottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ color: "#8e95a7", fontSize: 12 }}>
              Highlight cut (dB):{" "}
              <input
                type="number"
                value={cutDb}
                min={3}
                max={30}
                step={1}
                onChange={(e) => setCutDb(Number(e.target.value))}
                style={{ width: 64, padding: "6px 8px", background: "#fff", borderRadius: 10, border: "1px solid rgba(15,18,34,.12)" }}
              />
            </label>
            <button
              onClick={() => setBypass((b) => !b)}
              style={{
                ...UI.btn,
                background: bypass ? "#2f3136" : "#ffd54a",
                color: bypass ? "#fff" : "#000",
                borderColor: "rgba(15,18,34,.12)",
              }}
              title="Bypass device EQ and play the original mix"
            >
              {bypass ? "Bypass: ON (Original)" : "Bypass: OFF (Simulating)"}
            </button>
          </div>
        </div>

        {/* PANELS */}
        <div style={UI.grid} className="orbit-inset">
          <div style={UI.panel(true)}>
            <canvas ref={specRef} width={1100} height={360} style={{ width: "100%", display: "block", background: "transparent" }} />
          </div>
          <div style={UI.panel()} className="orbit-inset">
            <canvas ref={stereoRef} width={1100} height={380} style={{ width: "100%", display: "block", background: "transparent" }} />
          </div>
        </div>

      </div>
    </div>
  );
}
