/** Names a colour from its hex value, in the plain words used for filtering. Null if the hex is invalid. */
export function colorName(hex: string): string | null {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const chroma = max - min;
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));

  if (light < 0.13) return "Black";
  if (light > 0.92) return "White";
  if (saturation < 0.12 || chroma < 0.06) return light < 0.3 ? "Charcoal" : "Grey";

  let hue = 0;
  if (max === r) hue = ((g - b) / chroma + 6) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;

  if (hue < 15 || hue >= 345) return light < 0.3 ? "Burgundy" : light > 0.75 ? "Pink" : "Red";
  if (hue < 45) return light < 0.45 ? "Brown" : light > 0.75 ? "Beige" : "Orange";
  if (hue < 70) return light > 0.75 ? "Ecru" : light < 0.4 ? "Olive" : "Yellow";
  if (hue < 170) return hue < 90 && light < 0.35 ? "Olive" : "Green";
  if (hue < 200) return "Teal";
  if (hue < 255) return light < 0.35 ? "Navy" : "Blue";
  if (hue < 300) return "Purple";
  return "Pink";
}
