// pages/orbit.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAudioStore } from "../components/AudioStore"; // ← 这里按你项目实际文件名改：AudioStore / AudioProvider

/* ──────────────────────────────────────────────────────────────────────────────
   Device profiles (illustrative; *not* manufacturer specs)
───────────────────────────────────────────────────────────────────────────────*/
type DeviceKey =
  | "flat"
  | "iphone14pm_approx"
  | "airpods_pro_approx"
  | "samsung_tv_approx"
  | "car_speakers_approx"
  | "laptop_approx";

const DEVICE_LABEL: Record<DeviceKey, { icon: string; label: string }> = {
  iphone14pm_approx: { icon: "📱", label: "iPhone" },
  car_speakers_approx: { icon: "🚗", label: "Car" },
  samsung_tv_approx: { icon: "📺", label: "TV" },
  airpods_pro_approx: { icon: "🎧", label: "AirPods" },
  laptop_approx: { icon: "💻", label: "Laptop" },
  flat: { icon: "🟣", label: "Flat" },
};

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

/* helpers */
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

export default function Orbit() {
  const { url, fileName } = useAudioStore();

  // UI state
  const [mounted, setMounted] = useState(false);
  const [deviceKey, setDeviceKey] = useState<DeviceKey>("iphone14pm_approx");
  const [cutDb, setCutDb] = useState(12);
  const [bypass, setBypass] = useState(false);

  // player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);

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

  // live refs for draw loop
  const deviceKeyRef = useRef(deviceKey);
  const bypassRef = useRef(bypass);
  const cutDbRef = useRef(cutDb);
  useEffect(() => { deviceKeyRef.current = deviceKey; }, [deviceKey]);
  useEffect(() => { bypassRef.current = bypass; }, [bypass]);
  useEffect(() => { cutDbRef.current = cutDb; }, [cutDb]);

  // viz knobs
  const minDb = -90, maxDb = -10;
  const fftSize = 16384;
  const analyserSmoothing = 0.93;
  const crossFrameAlpha = 0.82;
  const minHz = 20, maxHz = 20000;
  const cssHeight = 360;

  // styles (完全不依赖外部 CSS)
  const UI = useMemo(() => {
    const PRIMARY = "#7D6CFF";
    return {
      page: {
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 10% -10%, #ffeef3 0%, transparent 55%)," +
          "radial-gradient(1200px 600px at 90% -10%, #eef0ff 0%, transparent 55%), #eef1f7",
        padding: 24,
      } as React.CSSProperties,
      wrap: { maxWidth: 1200, margin: "0 auto" } as React.CSSProperties,
      surface: {
        position: "relative",
        padding: 28,
        borderRadius: 26,
        background: "linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.56))",
        border: "1px solid rgba(255,255,255,.9)",
        boxShadow: "0 12px 60px rgba(119,92,255,.18), 0 24px 80px rgba(15,18,34,.10)",
        overflow: "hidden",
      } as React.CSSProperties,
      glow: {
        position: "absolute" as const,
        inset: -200,
        background:
          "radial-gradient(900px 420px at 18% 12%, rgba(255,205,225,.50) 0%, transparent 55%)," +
          "radial-gradient(900px 420px at 82% 12%, rgba(170,160,255,.42) 0%, transparent 55%)",
        pointerEvents: "none" as const,
      },
      topRow: { display: "flex", gap: 18, alignItems: "center" } as React.CSSProperties,
      playBtn: (active: boolean): React.CSSProperties => ({
        width: 48,
        height: 48,
        borderRadius: 16,
        border: "1px solid rgba(15,18,34,.08)",
        background: active ? `linear-gradient(180deg, ${PRIMARY}, #A98CFF)` : "#fff",
        color: active ? "#fff" : "#0f1222",
        cursor: "pointer",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.9), inset 0 -8px 24px rgba(15,18,34,.06)",
        display: "grid",
        placeItems: "center",
        fontSize: 16,
      }),
      chip: (active: boolean): React.CSSProperties => ({
        width: 44,
        height: 44,
        borderRadius: 16,
        border: "1px solid rgba(15,18,34,.08)",
        background: active ? `linear-gradient(180deg, ${PRIMARY}, #A98CFF)` : "#fff",
        color: active ? "#fff" : "#0f1222",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }),
      slider: {} as React.CSSProperties,
      grid: { display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18, marginTop: 18 } as React.CSSProperties,
      panel: {
        background: "rgba(255,255,255,.60)",
        border: "1px solid rgba(15,18,34,.06)",
        borderRadius: 18,
        padding: 12,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.9), inset 0 -10px 30px rgba(15,18,34,.05)",
      } as React.CSSProperties,
      bottom: {
        marginTop: 18,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      } as React.CSSProperties,
      number: {
        width: 70,
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(15,18,34,.12)",
        background: "rgba(255,255,255,.70)",
      } as React.CSSProperties,
      toggleBtn: (on: boolean): React.CSSProperties => ({
        padding: "10px 14px",
        borderRadius: 14,
        border: "1px solid rgba(15,18,34,.10)",
        cursor: "pointer",
        background: on ? "#2f3136" : `linear-gradient(180deg, ${PRIMARY}, #A98CFF)`,
        color: "#fff",
      }),
      subtle: { color: "rgba(15,18,34,.55)", fontSize: 12 } as React.CSSProperties,
      title: { fontWeight: 650, marginBottom: 8 } as React.CSSProperties,
    };
  }, []);

  // mount
  useEffect(() => setMounted(true), []);


  const fmt = (t: number) =>
    !Number.isFinite(t) ? "0:00" : `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;

  const seek = (v: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = v;
    setPos(v);
  };

  const ensureResumed = async () => {
    const ac = audioCtxRef.current;
    if (!ac) return;
    try {
      if (ac.state === "suspended") await ac.resume();
    } catch {}
  };

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    await ensureResumed();
    if (a.paused) {
      try { await a.play(); } catch {}
    } else {
      a.pause();
    }
  };

  const listeningText =
    deviceKey.includes("iphone")
      ? "iPhone speaker"
      : deviceKey.includes("airpods")
      ? "AirPods Pro"
      : deviceKey.includes("samsung")
      ? "Samsung TV"
      : deviceKey.includes("car")
      ? "car speakers"
      : deviceKey.includes("laptop")
      ? "laptop speaker"
      : "flat";

  // INIT audio + canvases (ONCE)
  useEffect(() => {
    if (!mounted) return;
    if (!audioRef.current || !specRef.current || !stereoRef.current) return;
    if (audioCtxRef.current) return;

    // @ts-ignore
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac: AudioContext = new AC();
    audioCtxRef.current = ac;

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
    analyserLRef.current = analyserL;
    analyserRRef.current = analyserR;

    const outGain = ac.createGain();
    outGain.gain.value = 1;
    outGainRef.current = outGain;

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

    // resume on gesture
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
      ctx.fillStyle = "rgba(15,18,34,0.45)";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";

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

    // DRAW LOOP (沿用你原来逻辑，只改配色)
    const draw = () => {
      const PURPLE = "#7D6CFF";
      const PURPLE_SOFT = "rgba(125,108,255,0.22)";
      const GRAY_SOFT = "rgba(0,0,0,0.10)";



      // ===== Spectrum =====
      analyserMix.getFloatFrequencyData(mixData);

      const W = widthPx(specCanvas);
      const H = Math.floor(specCanvas.height / dpr);

      specCtx.clearRect(0, 0, W, H);
      drawGrid(specCtx, W, H);

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

      const dbSpatial = new Float32Array(W);
      for (let i = 0; i < W; i++) {
        let s = 0, c = 0;
        for (let k = -4; k <= 4; k++) { const j = Math.min(W - 1, Math.max(0, i + k)); s += dbRaw[j]; c++; }
        dbSpatial[i] = s / c;
      }

      if (!prevDbRef.current) prevDbRef.current = dbSpatial.slice();
      const prev = prevDbRef.current!;
      const dbSmooth = new Float32Array(W);
      for (let i = 0; i < W; i++) dbSmooth[i] = crossFrameAlpha * prev[i] + (1 - crossFrameAlpha) * dbSpatial[i];
      prevDbRef.current = dbSmooth;

      const profile = DEVICE_PROFILES[deviceKeyRef.current];
      const deviceDb = new Float32Array(W);
      const attenDb = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        const hz = xToHz(x, W);
        const att = interpDbLog(hz, profile.anchors);
        attenDb[x] = att;
        deviceDb[x] = dbSmooth[x] + att;
      }

      // original curve (gray)
      let px = 0, py = dbToY(dbSmooth[0], H);
      specCtx.beginPath(); specCtx.moveTo(0, py);
      for (let x = 1; x < W; x++) {
        const y = dbToY(dbSmooth[x], H);
        const cx = (px + x) / 2, cy = (py + y) / 2;
        specCtx.quadraticCurveTo(px, py, cx, cy);
        px = x; py = y;
      }
      specCtx.strokeStyle = "rgba(0,0,0,0.55)";
      specCtx.lineWidth = 2; specCtx.stroke();
      specCtx.lineTo(W, H); specCtx.lineTo(0, H); specCtx.closePath();
      specCtx.fillStyle = GRAY_SOFT; specCtx.fill();

      // device curve (purple)
      px = 0; py = dbToY(deviceDb[0], H);
      specCtx.beginPath(); specCtx.moveTo(0, py);
      for (let x = 1; x < W; x++) {
        const y = dbToY(deviceDb[x], H);
        const cx = (px + x) / 2, cy = (py + y) / 2;
        specCtx.quadraticCurveTo(px, py, cx, cy);
        px = x; py = y;
      }
      specCtx.strokeStyle = PURPLE;
      specCtx.lineWidth = 2; specCtx.stroke();

      // cutoff shading
      if (!bypassRef.current && deviceKeyRef.current !== "flat") {
        const th = cutDbRef.current;
        specCtx.fillStyle = PURPLE_SOFT;
        for (let x = 0; x < W; x++) {
          const diff = -attenDb[x];
          if (diff >= th) {
            const y1 = dbToY(dbSmooth[x], H);
            const y2 = dbToY(deviceDb[x], H);
            specCtx.fillRect(x, Math.min(y1, y2), 1, Math.abs(y2 - y1));
          }
        }
      }
// ===== Stereo Field (upper semicircle, consistent coords) =====
{
  const AL = analyserLRef.current!, AR = analyserRRef.current!;
  const n = AL.fftSize;
  const timeL = new Float32Array(n);
  const timeR = new Float32Array(n);
  AL.getFloatTimeDomainData(timeL);
  AR.getFloatTimeDomainData(timeR);

  const SW = widthPx(stereoCanvas);
  const SH = Math.floor(stereoCanvas.height / dpr);

  stereoCtx.clearRect(0, 0, SW, SH);
  const cx0 = Math.floor(SW / 2);
  const padBottom = 14;
  const cy0 = Math.floor(SH - padBottom);
  const Rmax = Math.min(SW * 0.46, (SH - padBottom - 10));

  // mapping: theta in [0..PI], 0=left, PI/2=up (mono), PI=right
  const toXY = (theta: number, radius: number) => {
    const x = cx0 + Rmax * radius * Math.cos(theta);
    const y = cy0 - Rmax * radius * Math.sin(theta); // y向上：用减号
    return { x, y };
  };
  // --- grid (draw in SAME coord system) ---
  stereoCtx.save();
  stereoCtx.strokeStyle = "rgba(0,0,0,0.07)";
  stereoCtx.lineWidth = 1;

  // arcs
  for (let rr = 0.25; rr <= 1.0; rr += 0.25) {
    stereoCtx.beginPath();
    for (let deg = 0; deg <= 180; deg += 2) {
      const a = (Math.PI / 180) * deg;
      const { x, y } = toXY(a, rr);
      if (deg === 0) stereoCtx.moveTo(x, y);
      else stereoCtx.lineTo(x, y);
    }
    stereoCtx.stroke();
  }

  // radial lines (0,45,90,135,180)
  [0, 45, 90, 135, 180].forEach((deg) => {
    const a = (Math.PI / 180) * deg;
    const p1 = toXY(a, 0);
    const p2 = toXY(a, 1);
    stereoCtx.beginPath();
    stereoCtx.moveTo(p1.x, p1.y);
    stereoCtx.lineTo(p2.x, p2.y);
    stereoCtx.stroke();
  });

  stereoCtx.restore();

  const BINS = 181;
  const histO = new Float32Array(BINS);
  const histD = new Float32Array(BINS);

  const prof = DEVICE_PROFILES[deviceKeyRef.current];
  const mono = bypassRef.current || deviceKeyRef.current === "flat" ? 0 : prof.mono;
  const avgDb = avgAttDb(prof.anchors);
  const avgLin = Math.pow(10, avgDb / 20);

  // --- build hist + sparkles ---
  for (let i = 0; i < n; i++) {
    const L = timeL[i], R = timeR[i];

    // fold to upper semicircle
    const La = Math.abs(L);
    const Ra = Math.abs(R);

    let theta = 2 * Math.atan2(Ra, La); // 0..PI
    theta = Math.max(0, Math.min(Math.PI, theta));
    const r = Math.min(1, Math.sqrt(L * L + R * R));

    const bin = Math.min(BINS - 1, Math.max(0, Math.floor((theta / Math.PI) * (BINS - 1))));
    histO[bin] += r;

    const Ld = avgLin * ((1 - mono / 2) * L + (mono / 2) * R);
    const Rd = avgLin * ((1 - mono / 2) * R + (mono / 2) * L);

    const Lda = Math.abs(Ld);
    const Rda = Math.abs(Rd);

    let thetaD = 2 * Math.atan2(Rda, Lda);
    thetaD = Math.max(0, Math.min(Math.PI, thetaD));
    const rD = Math.min(1, Math.sqrt(Ld * Ld + Rd * Rd));

    const binD = Math.min(BINS - 1, Math.max(0, Math.floor((thetaD / Math.PI) * (BINS - 1))));
    histD[binD] += rD;

    // sparkles (same coord system, no save/restore transforms)
    if ((i & 7) === 0) {
      const pO = toXY(theta, r);
      stereoCtx.globalAlpha = 0.28;
      stereoCtx.fillStyle = "rgba(0,0,0,0.45)";
      stereoCtx.fillRect(pO.x, pO.y, 1.25, 1.25);

      const pD = toXY(thetaD, rD);
      stereoCtx.globalAlpha = 0.55;
      stereoCtx.fillStyle = PURPLE;
      stereoCtx.fillRect(pD.x, pD.y, 1.25, 1.25);
    }
  }
  stereoCtx.globalAlpha = 1;

  const smoothNorm = (src: Float32Array) => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      let s = 0, c = 0;
      for (let k = -2; k <= 2; k++) {
        const j = Math.min(src.length - 1, Math.max(0, i + k));
        s += src[j]; c++;
      }
      out[i] = s / c;
    }
    let m = 1e-6;
    for (const v of out) m = Math.max(m, v);
    for (let i = 0; i < out.length; i++) out[i] /= m;
    return out;
  };

  const rO = smoothNorm(histO);
  const rDev = smoothNorm(histD);

  // --- outlines ---
  stereoCtx.beginPath();
  for (let i = 0; i < BINS; i++) {
    const theta = (i / (BINS - 1)) * Math.PI;
    const rr = Math.max(rO[i], 0.01);
    const { x, y } = toXY(theta, rr);
    if (i === 0) stereoCtx.moveTo(x, y);
    else stereoCtx.lineTo(x, y);
  }
  stereoCtx.strokeStyle = "rgba(0,0,0,0.55)";
  stereoCtx.lineWidth = 2;
  stereoCtx.stroke();

  stereoCtx.beginPath();
  for (let i = 0; i < BINS; i++) {
    const theta = (i / (BINS - 1)) * Math.PI;
    const rr = Math.max(rDev[i], 0.01);
    const { x, y } = toXY(theta, rr);
    if (i === 0) stereoCtx.moveTo(x, y);
    else stereoCtx.lineTo(x, y);
  }
  stereoCtx.strokeStyle = PURPLE;
  stereoCtx.lineWidth = 2;
  stereoCtx.stroke();

  // --- shaded angles where device loses ≥ threshold ---
  if (!bypassRef.current && deviceKeyRef.current !== "flat") {
    const ratioTh = Math.pow(10, -cutDbRef.current / 20);
    stereoCtx.fillStyle = PURPLE_SOFT;

    let i = 0;
    while (i < BINS) {
      while (i < BINS && !(rDev[i] <= rO[i] * ratioTh)) i++;
      if (i >= BINS) break;
      const start = i;
      while (i < BINS && rDev[i] <= rO[i] * ratioTh) i++;
      const end = i - 1;

      stereoCtx.beginPath();
      for (let j = start; j <= end; j++) {
        const theta = (j / (BINS - 1)) * Math.PI;
        const rr = Math.max(rO[j], 0.01);
        const { x, y } = toXY(theta, rr);
        if (j === start) stereoCtx.moveTo(x, y);
        else stereoCtx.lineTo(x, y);
      }
      for (let j = end; j >= start; j--) {
        const theta = (j / (BINS - 1)) * Math.PI;
        const rr = Math.max(rDev[j], 0.01);
        const { x, y } = toXY(theta, rr);
        stereoCtx.lineTo(x, y);
      }
      stereoCtx.closePath();
      stereoCtx.fill();
    }
  }
}

      rafIdRef.current = requestAnimationFrame(draw);
    };

    rafIdRef.current = requestAnimationFrame(draw);

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

  // (关键) rebuild 输出链路：保证“有声 + device 切换有效”
  useEffect(() => {
    const ac = audioCtxRef.current;
    const src = sourceRef.current;
    const analyserMix = analyserMixRef.current;
    const splitter = splitterRef.current;
    const outGain = outGainRef.current;
    if (!mounted || !ac || !src || !analyserMix || !splitter || !outGain) return;

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
      return;
    }

    // multi-band approx
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

    filters.forEach((n) => (n.gain.value = Math.max(-24, Math.min(12, n.gain.value))));

    let prev: AudioNode = src;
    for (const f of filters) { prev.connect(f); prev = f; }

    // stereo collapse
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
  }, [mounted, deviceKey, bypass, url]);

  // set audio src from landing upload
  useEffect(() => {
    const a = audioRef.current;
    if (!mounted || !a) return;

    if (!url) {
      a.removeAttribute("src");
      a.load();
      return;
    }

    a.src = url;
    a.load();

    // demo-friendly: try autoplay; if blocked user presses play
    (async () => {
      await ensureResumed();
      try { await a.play(); } catch {}
    })();
  }, [mounted, url]);
  useEffect(() => {
  const a = audioRef.current;
  if (!mounted || !a) return;

  let raf = 0;

  const onLoaded = () => {
    setDur(Number.isFinite(a.duration) ? a.duration : 0);
    setPos(a.currentTime || 0);
  };

  const loop = () => {
    setPos(a.currentTime || 0);
    raf = requestAnimationFrame(loop);
  };

  const onPlay = () => {
    setIsPlaying(true);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };

  const onPause = () => {
    setIsPlaying(false);
    cancelAnimationFrame(raf);
    setPos(a.currentTime || 0);
  };

  a.addEventListener("loadedmetadata", onLoaded);
  a.addEventListener("durationchange", onLoaded);
  a.addEventListener("play", onPlay);
  a.addEventListener("pause", onPause);
  a.addEventListener("ended", onPause);

  // 如果已经有 metadata（比如热更新后）
  if (a.readyState >= 1) onLoaded();

  return () => {
    cancelAnimationFrame(raf);
    a.removeEventListener("loadedmetadata", onLoaded);
    a.removeEventListener("durationchange", onLoaded);
    a.removeEventListener("play", onPlay);
    a.removeEventListener("pause", onPause);
    a.removeEventListener("ended", onPause);
  };
}, [mounted]);


  const sliderMax = Math.max(1, Math.floor(dur));
  const sliderVal = Math.min(Math.floor(pos), sliderMax);

  if (!mounted) return null;

  return (
    <div style={UI.page}>
      <div style={UI.wrap}>
        <div style={UI.surface}>
          <div style={UI.glow} />

          {/* slider thumb style */}
          <style>{`
            .orbit-range{ -webkit-appearance:none; appearance:none; height:8px;
              background: linear-gradient(90deg, #7D6CFF, #A98CFF); border-radius:999px;
              box-shadow: inset 0 2px 8px rgba(15,18,34,.14); width:100%;
            }
            .orbit-range::-webkit-slider-thumb{ -webkit-appearance:none; width:22px; height:22px; border-radius:50%;
              background:#fff; border:3px solid #7D6CFF; box-shadow:0 6px 18px rgba(125,108,255,.30);
            }
          `}</style>

          {/* TOP */}
          <div style={{ maxWidth: 640 }}>
            <div style={UI.topRow}>
              <button onClick={togglePlay} style={UI.playBtn(isPlaying)} aria-label="play/pause">
                {isPlaying ? "⏸" : "▶️"}
              </button>

              <div style={{ flex: 1 }}>
                <div style={UI.title}>{fileName ?? "Orbit / EQ Visualizer"}</div>

                <input
                  className="orbit-range"
                  type="range"
                  min={0}
                  max={sliderMax}
                  value={sliderVal}
                  onChange={(e) => seek(Number(e.target.value))}
                />

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, ...UI.subtle }}>
                  <span>{fmt(pos)}</span>
                  <span>{fmt(dur)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              {(["iphone14pm_approx", "car_speakers_approx", "samsung_tv_approx", "airpods_pro_approx"] as DeviceKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setDeviceKey(k)}
                  style={UI.chip(deviceKey === k)}
                  title={DEVICE_LABEL[k].label}
                >
                  <span style={{ fontSize: 18 }}>{DEVICE_LABEL[k].icon}</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10, ...UI.subtle }}>
              Device simulation: <strong>{listeningText}</strong>
            </div>
          </div>

          {/* PANELS */}
          <div style={UI.grid}>
            <div style={UI.panel}>
              <div style={{ ...UI.subtle, fontWeight: 650, marginBottom: 8 }}>FREQUENCY RESPONSE</div>
              <canvas ref={specRef} width={1100} height={360} style={{ width: "100%", display: "block" }} />
            </div>
            <div style={UI.panel}>
              <div style={{ ...UI.subtle, fontWeight: 650, marginBottom: 8 }}>STEREO FIELD</div>
              <canvas ref={stereoRef} width={1100} height={380} style={{ width: "100%", display: "block" }} />
            </div>
          </div>

          {/* BOTTOM */}
          <div style={UI.bottom}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ ...UI.subtle, fontWeight: 650 }}>Highlight cut (dB)</div>
              <input
                type="number"
                value={cutDb}
                min={3}
                max={30}
                step={1}
                onChange={(e) => setCutDb(Number(e.target.value))}
                style={UI.number}
              />
            </div>

            <button onClick={() => setBypass((b) => !b)} style={UI.toggleBtn(bypass)}>
              {bypass ? "Bypass ON (Original)" : "Bypass OFF (Simulating)"}
            </button>
          </div>

          {/* hidden audio */}
          <audio ref={audioRef} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
        </div>
      </div>
    </div>
  );
}
