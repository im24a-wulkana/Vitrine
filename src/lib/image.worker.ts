// Heavy image work runs here so the page stays responsive. There's one worker file
// for both jobs: Chrome can run a second Turbopack worker entry with the first one's code.
export type ImageJob =
  | { kind: "compress"; id: number; file: Blob; maxBytes: number; maxSide: number; quality: number }
  | { kind: "cutout"; id: number; photo: Blob };

const scope = self as unknown as { onmessage: ((event: MessageEvent<ImageJob>) => void) | null; postMessage: (message: unknown) => void };

async function compress({ file, maxBytes, maxSide, quality }: Extract<ImageJob, { kind: "compress" }>): Promise<Blob> {
  // Applies the photo's EXIF rotation, so portrait shots stay upright.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  // JPEG has no transparency, which would otherwise turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  for (let q = quality - 0.15; blob.size > maxBytes && q >= 0.4; q -= 0.15) {
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
  }
  return blob;
}

// The library's own worker option only applies to WebGPU, so on CPU it would otherwise
// block the page for up to a minute on a phone. Loaded on demand, because compressing
// doesn't need its 50 MB model, and a listener set up after an async import misses messages.
async function cutout(job: Extract<ImageJob, { kind: "cutout" }>): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(job.photo, {
    model: "isnet_quint8",
    device: "cpu",
    output: { format: "image/webp", quality: 0.85 },
    progress: (key: string, current: number, total: number) => {
      if (key.startsWith("fetch:")) scope.postMessage({ id: job.id, type: "progress", current, total });
    },
  });
}

scope.onmessage = async ({ data: job }) => {
  try {
    const blob = await (job.kind === "compress" ? compress(job) : cutout(job));
    scope.postMessage({ id: job.id, type: "done", blob });
  } catch (error) {
    scope.postMessage({ id: job.id, type: "error", message: error instanceof Error ? error.message : "Image processing failed" });
  }
};

// Jobs wait for this, so none can arrive before the listener above exists.
scope.postMessage({ type: "ready" });
