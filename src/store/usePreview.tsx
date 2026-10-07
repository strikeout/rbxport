/**
 * The browser's preview: a click on a track's preview waveform plays that
 * track from the clicked place, on the engine's third voice (`"p"`).
 *
 * Audio › Preview in Preferences sets what the decks do meanwhile. "mute"
 * lets them play on unheard. "stop" pauses the decks that were playing and
 * starts them again when the preview ends; a synced deck then starts on the
 * beat, as any PLAY does. A preview ends on Escape, at the end of the track,
 * or, in "stop" mode, when a deck is started by hand. A deck started by hand
 * is not started again.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getBackend } from "@/ipc/client";
import type { DeckId } from "@/ipc/types";
import type { PreviewMainPlayers } from "@/lib/preferences";
import { deckControls } from "@/lib/scripting";
import { usePlayback } from "./usePlayback";
import { usePreferences } from "./usePreferences";

export interface Preview {
  /** The track the preview voice holds, or null. */
  trackId: string | null;
  /** True from the click until the preview ends. */
  active: boolean;
  /** Plays `trackId` from `seconds`. The same track again only moves the head. */
  play: (trackId: string, seconds: number) => void;
  /** Ends the preview and gives the decks back. */
  stop: () => void;
  /** The preview's playhead, in seconds, every frame while it plays. */
  subscribe: (listener: (seconds: number) => void) => () => void;
}

const MAIN: readonly DeckId[] = ["a", "b"];

/** Ticks this soon after the decks were paused can still say they play. */
const SETTLE_MS = 300;

/** Closer than this to the end, in seconds, is the end. */
const AT_END = 0.05;

const PreviewContext = createContext<Preview>({
  trackId: null,
  active: false,
  play: () => {},
  stop: () => {},
  subscribe: () => () => {},
});

export function usePreview(): Preview {
  return useContext(PreviewContext);
}

function setMuted(muted: boolean): void {
  void getBackend()
    .then((backend) => Promise.all(MAIN.map((deck) => backend.setChannelMuted(deck, muted))))
    .catch(() => undefined);
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const mode = usePreferences().audio.previewMainPlayers;
  const [trackId, setTrackId] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  /** The click to act on once the voice holds its track. A new object a click. */
  const [request, setRequest] = useState<{ seconds: number } | null>(null);
  const playback = usePlayback(trackId, "p", false);
  const current = useRef(playback);
  current.current = playback;
  /** What the preview did to the decks, so that the end undoes exactly that. */
  const taken = useRef<{ mode: PreviewMainPlayers; paused: DeckId[]; at: number } | null>(null);

  // A mute outlives a reload of the window, because the engine does not
  // reload with it. Nothing is previewing yet, so no deck should be muted.
  useEffect(() => setMuted(false), []);

  const end = useCallback((resume: boolean) => {
    const was = taken.current;
    taken.current = null;
    setActive(false);
    if (current.current.playing) current.current.toggle();
    if (!was) return;
    if (was.mode === "mute") {
      setMuted(false);
      return;
    }
    if (!resume) return;
    for (const deck of was.paused) {
      const controls = deckControls(deck);
      if (controls && !controls.idle() && !controls.playing()) controls.togglePlay();
    }
  }, []);

  const stop = useCallback(() => end(true), [end]);

  const play = useCallback(
    (next: string, seconds: number) => {
      if (!taken.current) {
        const paused: DeckId[] = [];
        if (mode === "mute") setMuted(true);
        else {
          for (const deck of MAIN) {
            const controls = deckControls(deck);
            if (controls?.playing()) {
              controls.togglePlay();
              paused.push(deck);
            }
          }
        }
        taken.current = { mode, paused, at: performance.now() };
        setActive(true);
      }
      setTrackId(next);
      setRequest({ seconds });
    },
    [mode],
  );

  // After `usePlayback` has started the load for a new track, in the same
  // commit: its effects run before this one. The seek then waits for the
  // load, and so does the start. A voice that was playing keeps PLAY across
  // the load, so only a stopped one is started.
  useEffect(() => {
    if (!request) return;
    const voice = current.current;
    voice.seek(request.seconds);
    if (!voice.playing) voice.toggle();
  }, [request]);

  // The end of the track ends the preview.
  const { subscribe } = playback;
  useEffect(() => {
    if (!active) return;
    return subscribe((seconds) => {
      const total = current.current.duration;
      if (total > 0 && seconds >= total - AT_END) end(true);
    });
  }, [active, subscribe, end]);

  // Escape ends it.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) end(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, end]);

  // In "stop" mode, a deck started by hand ends it, and nothing is resumed.
  useEffect(() => {
    if (!active || mode !== "stop") return;
    let unlisten: (() => void) | undefined;
    let live = true;
    void getBackend().then((backend) => {
      if (!live) return;
      unlisten = backend.onDeckTick(() => {
        const was = taken.current;
        if (!was || performance.now() - was.at < SETTLE_MS) return;
        if (MAIN.some((deck) => deckControls(deck)?.playing())) end(false);
      });
    });
    return () => {
      live = false;
      unlisten?.();
    };
  }, [active, mode, end]);

  const value = useMemo<Preview>(
    () => ({ trackId, active, play, stop, subscribe }),
    [trackId, active, play, stop, subscribe],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
