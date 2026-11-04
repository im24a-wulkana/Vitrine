// Generates the dark sample photos used by the seed data.
// Run once: node scripts/generate-placeholders.mjs
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/placeholders", { recursive: true });

const SHAPES = {
  outerwear: "M155 150 L205 120 L245 120 L295 150 L350 300 L315 315 L295 250 L295 500 L155 500 L155 250 L135 315 L100 300 Z M225 120 L225 500",
  top: "M160 170 L205 150 Q225 170 245 150 L290 170 L345 260 L310 285 L285 240 L285 440 L165 440 L165 240 L140 285 L105 260 Z",
  bottom: "M165 110 L285 110 L305 510 L240 510 L225 220 L210 510 L145 510 Z",
  shoe: "M90 330 L165 270 Q190 305 235 310 L335 345 Q365 360 360 395 L90 395 Z M90 395 L360 395 L360 412 L90 412 Z",
  bag: "M125 240 L325 240 L345 470 L105 470 Z M175 240 Q175 130 225 130 Q275 130 275 240",
};

for (const [name, path] of Object.entries(SHAPES)) {
  writeFileSync(
    `public/placeholders/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 562" preserveAspectRatio="xMidYMid slice"><rect width="450" height="562" fill="#171512"/><path d="${path}" fill="#23201c" stroke="#c9b48a" stroke-width="1.25" stroke-linejoin="round"/></svg>\n`,
  );
}
