"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal ambient types for the Web Speech API (not in TS DOM lib). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_COPY: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings and try again.",
  "service-not-allowed": "Voice input was blocked by the browser. Check site permissions.",
  "no-speech": "Nothing came through. Tap the mic and speak again.",
  "audio-capture": "No microphone found on this device.",
  network: "The speech service is unreachable. Check your connection.",
};

export type VoiceError = string | null;

export function useVoiceInput(options?: {
  lang?: string;
  levelTarget?: React.RefObject<HTMLElement | null>;
}) {
  const { lang = "en-IN", levelTarget } = options ?? {};
  const [supported] = useState<boolean>(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<VoiceError>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  const teardownMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    levelTarget?.current?.style.setProperty("--voice-level", "0");
  }, [levelTarget]);

  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        // Perceptual curve: quiet speech should still visibly move the UI.
        const level = Math.min(1, Math.pow(rms * 3.2, 0.8));
        levelTarget?.current?.style.setProperty("--voice-level", level.toFixed(3));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Metering is decorative — recognition continues without it.
    }
  }, [levelTarget]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    recognitionRef.current?.stop();
    teardownMeter();
    setListening(false);
  }, [teardownMeter]);

  const reset = useCallback(() => {
    setInterim("");
    setFinalText("");
    setError(null);
  }, []);

  const start = useCallback(async () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice input needs Chrome, Edge, or another Chromium browser.");
      return;
    }
    setError(null);
    setInterim("");
    setFinalText("");
    stoppingRef.current = false;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let live = "";
      let done = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          done += result[0].transcript;
        } else {
          live += result[0].transcript;
        }
      }
      if (done) setFinalText((prev) => `${prev}${done} `.trimStart());
      setInterim(live);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      setError(ERROR_COPY[event.error] ?? "Voice input failed. Please try again.");
    };

    recognition.onend = () => {
      teardownMeter();
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      void startMeter();
    } catch {
      setError("Could not start voice input. Please try again.");
    }
  }, [lang, startMeter, teardownMeter]);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      recognitionRef.current?.abort();
      teardownMeter();
    };
  }, [teardownMeter]);

  return { supported, listening, interim, finalText, error, start, stop, reset };
}
