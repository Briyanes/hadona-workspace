"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TimerState {
  isRunning: boolean;
  startedAt: number | null; // epoch ms when timer started
  description: string;
  clientId: string;
  activityType: string;
}

const STORAGE_KEY = "hadona-timer";
const IDLE_STATE: TimerState = {
  isRunning: false,
  startedAt: null,
  description: "",
  clientId: "",
  activityType: "general",
};

/**
 * useTimer — a persistent live timer hook for time tracking.
 * - Survives page refresh via localStorage
 * - Provides elapsed seconds (re-rendered every second)
 * - Returns start/stop/reset functions
 */
export function useTimer() {
  const [state, setState] = useState<TimerState>(IDLE_STATE);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as TimerState;
        setState(parsed);
        if (parsed.isRunning && parsed.startedAt) {
          setElapsed(Math.floor((Date.now() - parsed.startedAt) / 1000));
        }
      }
    } catch {
      // Corrupted storage — ignore
    }
  }, []);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable — ignore
    }
  }, [state]);

  // Tick interval
  useEffect(() => {
    if (state.isRunning && state.startedAt) {
      // Update immediately
      setElapsed(Math.floor((Date.now() - state.startedAt) / 1000));

      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - state.startedAt!) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state.isRunning, state.startedAt]);

  const start = useCallback(
    (opts?: Partial<Pick<TimerState, "description" | "clientId" | "activityType">>) => {
      setState({
        isRunning: true,
        startedAt: Date.now(),
        description: opts?.description ?? "",
        clientId: opts?.clientId ?? "",
        activityType: opts?.activityType ?? "general",
      });
      setElapsed(0);
    },
    []
  );

  const stop = useCallback(() => {
    const finalElapsed = state.startedAt
      ? Math.floor((Date.now() - state.startedAt) / 1000)
      : 0;
    setState((prev) => ({ ...prev, isRunning: false }));
    return finalElapsed;
  }, [state.startedAt]);

  const reset = useCallback(() => {
    setState(IDLE_STATE);
    setElapsed(0);
  }, []);

  const updateMeta = useCallback(
    (meta: Partial<Pick<TimerState, "description" | "clientId" | "activityType">>) => {
      setState((prev) => ({ ...prev, ...meta }));
    },
    []
  );

  return {
    isRunning: state.isRunning,
    elapsed,
    description: state.description,
    clientId: state.clientId,
    activityType: state.activityType,
    start,
    stop,
    reset,
    updateMeta,
  };
}

/** Format seconds into HH:MM:SS */
export function formatTimerTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}