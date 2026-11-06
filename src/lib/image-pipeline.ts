// Client-only image work: compression and background removal on the device. Both
// run in workers so the page stays responsive. Photos never leave the browser for
// this step. Only the AI model is downloaded, once, and the browser caches it.
import type { ImageJob } from "./image.worker";

type ImageWorker = { worker: Worker; ready: Promise<void> };

function startWorker(): ImageWorker {
  const worker = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
  const ready = new Promise<void>((resolve) => {
    const onMessage = ({ data }: MessageEvent) => {
      if (data.type !== "ready") return;
      worker.removeEventListener("message", onMessage);
      resolve();
    };
    worker.addEventListener("message", onMessage);
  });
  return { worker, ready };
}

function compress(request: Omit<Extract<ImageJob, { kind: "compress" }>, "kind" | "id">): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { worker, ready } = startWorker();
    const finish = (done: () => void) => {
      worker.terminate();
      done();
    };
    worker.onmessage = ({ data }) => {
      if (data.type === "done") finish(() => resolve(data.blob));
      else if (data.type === "error") finish(() => reject(new Error(data.message)));
    };
    worker.onerror = () => finish(() => reject(new Error("Couldn't start the image worker")));
    const job: ImageJob = { kind: "compress", id: 0, ...request };
    void ready.then(() => worker.postMessage(job));
  });
}

export async function compressPhoto(file: File): Promise<Blob> {
  try {
    return await compress({ file, maxBytes: 1.5 * 1024 * 1024, maxSide: 1600, quality: 0.85 });
  } catch {
    // Formats the browser can't decode (HEIC outside Safari, for example) go up unchanged.
    return file;
  }
}

export interface CutoutStatus {
  /** Photos waiting or being processed. */
  remaining: number;
  /** Model download percentage, or null when not downloading. */
  downloading: number | null;
}

const IDLE: CutoutStatus = { remaining: 0, downloading: null };
let status = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: Partial<CutoutStatus>) {
  status = { ...status, ...next };
  listeners.forEach((listener) => listener());
}

export const cutoutStatusStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => status,
  getServer: () => IDLE,
};

/** Gives up on a cutout that takes longer than this. The original photo is unaffected. */
const CUTOUT_TIMEOUT_MS = 3 * 60 * 1000;
/** The model holds hundreds of MB, so the worker is dropped soon after the last job. */
const IDLE_MS = 30 * 1000;

let cutouts: ImageWorker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

function stopWorker() {
  cutouts?.worker.terminate();
  cutouts = null;
}

function removeBackground(photo: Blob): Promise<Blob> {
  // The model peaks around 800 MB, which can crash the tab on smaller phones. Safari doesn't report memory.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory < 4) return Promise.reject(new Error("Not enough memory for background removal"));

  clearTimeout(idleTimer);
  cutouts ??= startWorker();
  const running = cutouts;
  const current = running.worker;
  const id = ++nextId;

  return new Promise<Blob>((resolve, reject) => {
    const fail = (reason: string) => {
      // A stuck or crashed worker can't be reused.
      if (cutouts === running) stopWorker();
      reject(new Error(reason));
    };
    const timeout = setTimeout(() => fail("Background removal took too long"), CUTOUT_TIMEOUT_MS);
    current.onerror = () => {
      clearTimeout(timeout);
      fail("Background removal stopped");
    };
    current.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === "progress") {
        setStatus({ downloading: data.total > 0 && data.current < data.total ? Math.round((data.current / data.total) * 100) : null });
        return;
      }
      clearTimeout(timeout);
      if (data.type === "done") resolve(data.blob);
      else reject(new Error(data.message));
    };
    const job: ImageJob = { kind: "cutout", id, photo };
    void running.ready.then(() => current.postMessage(job));
  });
}

let tail: Promise<unknown> = Promise.resolve();

/** One at a time: this is heavy on memory, and a batch must not exhaust a phone. */
export function queueCutout(photo: Blob): Promise<Blob> {
  setStatus({ remaining: status.remaining + 1 });
  const job = tail.then(() => removeBackground(photo));
  const done = () => {
    setStatus({ remaining: status.remaining - 1, downloading: null });
    if (status.remaining === 0) idleTimer = setTimeout(stopWorker, IDLE_MS);
  };
  tail = job.then(done, done);
  return job;
}

/** A small JPEG for AI tagging. Plenty for recognising a garment, and cheaper to send. */
export function photoForAi(file: Blob): Promise<Blob> {
  return compress({ file, maxBytes: 0.8 * 1024 * 1024, maxSide: 1024, quality: 0.8 });
}

/** The garment's dominant colour. Pass a cutout when there is one, so the background doesn't count. */
export async function dominantColor(src: string): Promise<string | null> {
  try {
    const { Vibrant } = await import("node-vibrant/browser");
    const palette = await Vibrant.from(src).getPalette();
    const swatches = Object.values(palette).filter((swatch) => swatch !== null);
    if (swatches.length === 0) return null;
    return swatches.reduce((best, swatch) => (swatch.population > best.population ? swatch : best)).hex;
  } catch {
    return null;
  }
}
