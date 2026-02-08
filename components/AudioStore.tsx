
"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type AudioState = {
  url: string | null;                 // objectURL for uploaded file
  fileName: string | null;
  setAudioFile: (f: File) => void;
  clear: () => void;
};

const Ctx = createContext<AudioState | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const setAudioFile = (f: File) => {
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(f));
    setFileName(f.name);
  };

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setFileName(null);
  };

  const value = useMemo(() => ({ url, fileName, setAudioFile, clear }), [url, fileName]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioStore must be used within <AudioProvider>");
  return v;
}
