// Client-only image work: compression before upload, and background removal on
// the device. Photos never leave the browser for this step. Only the AI model
// is downloaded, once, from the library's CDN, and the browser caches it.
import imageCompression from "browser-image-compression";

export async function compressPhoto(file: File): Promise<Blob> {
  try {
    return await imageCompression(file, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 1600,
      initialQuality: 0.85,
      fileType: "image/jpeg",
      // The library's worker mode loads its code from a third-party CDN at runtime.
      useWebWorker: false,
    });
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

async function removeBackground(photo: Blob): Promise<Blob> {
  // Imported on demand so the large library only loads when a photo needs it.
  const { removeBackground: run } = await import("@imgly/background-removal");
  return run(photo, {
    model: "isnet_quint8",
    device: "cpu",
    proxyToWorker: true,
    output: { format: "image/webp", quality: 0.85 },
    progress: (key: string, current: number, total: number) => {
      if (!key.startsWith("fetch:")) return;
      setStatus({ downloading: total > 0 && current < total ? Math.round((current / total) * 100) : null });
    },
  });
}

let tail: Promise<unknown> = Promise.resolve();

/** One at a time: this is heavy on memory, and a batch must not freeze a phone. */
export function queueCutout(photo: Blob): Promise<Blob> {
  setStatus({ remaining: status.remaining + 1 });
  const job = tail.then(() => removeBackground(photo));
  const done = () => setStatus({ remaining: status.remaining - 1, downloading: null });
  tail = job.then(done, done);
  return job;
}
