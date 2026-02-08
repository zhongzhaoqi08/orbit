import React, { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAudioStore } from "../components/AudioStore";

export default function LandingUpload() {
  const router = useRouter();
  const { setAudioFile } = useAudioStore();
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("audio/")) {
      alert("Please upload an audio file (mp3/wav/aiff/m4a).");
      return;
    }
    setAudioFile(f);
    router.push("/orbit"); // orbit.tsx 不用动
  };

  const subtitle = useMemo(
    () =>
      "Test out your mix with simulated devices across phones, earphones, cars, and TVs — without leaving your studio.",
    []
  );

  return (
    <div
      className={`page ${dragOver ? "over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        acceptFile(e.dataTransfer.files?.[0]);
      }}
    >
      <header className="nav">
        <div className="brand">
          <span className="mark" aria-hidden />
          <span className="name">Draftfr</span>
        </div>
      </header>

      <main className="hero">
        <h1 className="h1">Hear your mix everywhere</h1>
        <p className="p">{subtitle}</p>

        <div className="ctaRow">
          <label className="btn">
            Upload Audio
            <input
              className="file"
              type="file"
              accept="audio/*"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="hint">
          Drag & drop an audio file anywhere on this page.
        </div>
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(1000px 700px at 70% 20%, rgba(150, 130, 255, 0.30), transparent 60%),
            radial-gradient(900px 700px at 20% 85%, rgba(140, 220, 255, 0.26), transparent 60%),
            radial-gradient(900px 700px at 55% 50%, rgba(255, 175, 220, 0.26), transparent 62%),
            #f6f6fa;
          display: flex;
          flex-direction: column;
          color: rgba(20, 20, 30, 0.92);
        }
        .page.over:after {
          content: "";
          position: fixed;
          inset: 0;
          background: rgba(125, 108, 255, 0.08);
          outline: 2px dashed rgba(125, 108, 255, 0.35);
          outline-offset: -14px;
          pointer-events: none;
        }

        .nav {
          padding: 22px 34px;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          font-size: 20px;
        }
        .mark {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          background: linear-gradient(135deg, rgba(125, 108, 255, 1), rgba(183, 169, 255, 1));
          box-shadow: 0 10px 26px rgba(125, 108, 255, 0.28);
        }

        .hero {
          flex: 1;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 40px 24px 64px;
        }
        .h1 {
          font-size: clamp(46px, 6vw, 86px);
          line-height: 1.02;
          letter-spacing: -0.04em;
          margin: 0;
        }
        .p {
          margin: 18px 0 0;
          max-width: 720px;
          font-size: 16px;
          line-height: 1.6;
          color: rgba(20, 20, 30, 0.66);
        }

        .ctaRow {
          margin-top: 26px;
          display: flex;
          justify-content: center;
        }
        .btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 26px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(125, 108, 255, 1), rgba(108, 90, 255, 1));
          color: white;
          font-weight: 700;
          font-size: 14px;
          box-shadow:
            0 18px 42px rgba(125, 108, 255, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.35);
          cursor: pointer;
          user-select: none;
          transition: transform 140ms ease, filter 140ms ease;
        }
        .btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.03);
        }
        .file {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .hint {
          margin-top: 14px;
          font-size: 12px;
          color: rgba(20, 20, 30, 0.50);
        }
      `}</style>
    </div>
  );
}
