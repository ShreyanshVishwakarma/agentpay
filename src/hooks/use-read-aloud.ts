"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "agentpay.read-aloud";

export function useReadAloud() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) === "1";
      setEnabled(stored);
      enabledRef.current = stored;
    } catch {
      // Storage unavailable — default off.
    }
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const toggle = useCallback((next: boolean) => {
    setEnabled(next);
    enabledRef.current = next;
    if (!next) window.speechSynthesis?.cancel();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore.
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!enabledRef.current || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.03;
    utterance.pitch = 1;
    const voice = synth
      .getVoices()
      .find((v) => v.lang.startsWith("en") && /natural|neural|google/i.test(v.name));
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }, []);

  return { enabled, toggle, speak };
}
