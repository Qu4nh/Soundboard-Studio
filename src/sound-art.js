const waveColors = ['#c88c59', '#8ca6b8', '#a6b793', '#b293b0', '#d0b680', '#79b4a7'];
const covers = new Map();

export function waveformCover(key = '') {
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
  const variant = hash % waveColors.length;
  if (covers.has(variant)) return covers.get(variant);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new URL('assets/sound-default.png', document.baseURI).href;

  const color = waveColors[variant];
  const shade = ctx.createLinearGradient(0, 0, 256, 256);
  shade.addColorStop(0, '#333e37');
  shade.addColorStop(1, '#151e19');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = color + '34';
  for (const radius of [40, 68, 96]) {
    ctx.beginPath();
    ctx.arc(128, 128, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(18, 128);
  ctx.lineTo(238, 128);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(15, 128);
  for (let x = 16; x <= 241; x++) {
    const phase = (x - 15) / 226;
    const envelope = Math.sin(phase * Math.PI) ** (1 + (variant % 3) * 0.4);
    const wave = Math.sin(phase * Math.PI * (12 + variant * 3)) * 54 + Math.cos(17 * phase) * 13;
    ctx.lineTo(x, 128 + envelope * wave);
  }
  ctx.stroke();

  const cover = canvas.toDataURL('image/png');
  covers.set(variant, cover);
  return cover;
}
