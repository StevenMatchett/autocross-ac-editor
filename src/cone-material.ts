import { zlibSync } from 'fflate';

// Stable per-object appearance, independent of placement order or position.
export function coneSeed(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function random(seed: number) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
export function coneColor(id: string): [number, number, number] {
  const r = random(coneSeed(id));
  return [226 + Math.floor(r() * 22), 65 + Math.floor(r() * 28), 12 + Math.floor(r() * 12)];
}
export function coneTexture(id: string) {
  const width = 128, height = 256;
  const pixels = new Uint8Array(width * height * 4);
  const rand = random(coneSeed(id));
  const color = coneColor(id);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const grain = (rand() - .5) * 12;
    const fade = 1 + .035 * Math.sin(x / width * Math.PI * 6 + rand() * .2);
    for (let c = 0; c < 3; c++) pixels[offset + c] = Math.min(255, Math.max(0, color[c] * fade + grain));
    pixels[offset + 3] = 255;
  }
  const dab = (cx: number, cy: number, rx: number, ry: number, opacity: number, tint: number[]) => {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d >= 1 || rand() < .22) continue;
        const a = opacity * (1 - d) * (.45 + rand() * .55);
        const offset = (y * width + ((x % width + width) % width)) * 4;
        for (let c = 0; c < 3; c++) pixels[offset + c] = pixels[offset + c] * (1 - a) + tint[c] * a;
      }
    }
  };
  // Broken, irregular tire rubs clustered on a few sides, leaving most orange exposed.
  const patches = 3 + Math.floor(rand() * 4);
  for (let p = 0; p < patches; p++) {
    const x = rand() * width, y = 25 + rand() * 185;
    const length = 18 + rand() * 70, lean = (rand() - .5) * 30;
    const thickness = 1 + rand() * 3;
    for (let n = 0; n < length; n += 1.5) {
      if (rand() < .2) continue;
      dab(x + lean * n / length + (rand() - .5) * 4, y + n, thickness + rand() * 2, 2 + rand() * 4, .55 + rand() * .4, [43, 39, 34]);
    }
    for (let n = 0; n < 30; n++) dab(x + (rand() - .5) * 18, y + rand() * length, .6 + rand() * 1.3, 1 + rand() * 2, .5, [55, 46, 38]);
  }
  // Small abrasions and faded scratches, not reflective stripes.
  for (let n = 0; n < 65; n++) dab(rand() * width, rand() * height, .4 + rand(), 1 + rand() * 5, .22, [248, 139, 78]);
  return { width, height, pixels };
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4); bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
export function coneTexturePNG(texture: ReturnType<typeof coneTexture>) {
  const {width, height, pixels} = texture;
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const rows = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const chunks = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',zlibSync(rows)), chunk('IEND',new Uint8Array())];
  const result = new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));
  let offset=0; for (const c of chunks) { result.set(c,offset); offset+=c.length; }
  return result;
}
