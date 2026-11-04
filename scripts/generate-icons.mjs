// Generates the PWA icons in public/icons. Run once: node scripts/generate-icons.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

mkdirSync("public/icons", { recursive: true });

// A display case seen head-on: an off-white frame on near-black.
const svg = (size, inset) => {
  const p = Math.round(size * inset);
  const stroke = Math.round(size * 0.05);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#050505"/>
      <rect x="${p}" y="${p}" width="${size - 2 * p}" height="${size - 2 * p}" fill="none" stroke="#f2f2f2" stroke-width="${stroke}"/>
      <path d="M${p + size * 0.1} ${p + size * 0.1} L${size / 2} ${size - p - size * 0.1} L${size - p - size * 0.1} ${p + size * 0.1}" fill="none" stroke="#f2f2f2" stroke-width="${stroke}"/>
    </svg>`,
  );
};

await sharp(svg(192, 0.2)).png().toFile("public/icons/icon-192.png");
await sharp(svg(512, 0.2)).png().toFile("public/icons/icon-512.png");
await sharp(svg(512, 0.28)).png().toFile("public/icons/icon-maskable-512.png");
