const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function parseHex(color) {
  if (!HEX_COLOR.test(color || '')) return null;
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
}

function relativeLuminance(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixColor(source, target, amount) {
  const sourceRgb = parseHex(source);
  const targetRgb = parseHex(target);
  const mixed = sourceRgb.map((channel, index) =>
    Math.round(channel + (targetRgb[index] - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function ensureTextContrast(foreground, background, minimumRatio = 4.5) {
  const currentRatio = contrastRatio(foreground, background);
  if (currentRatio === null || currentRatio >= minimumRatio) {
    return { color: foreground, adjusted: false, shadow: 'transparent' };
  }

  const whiteRatio = contrastRatio('#ffffff', background);
  const blackRatio = contrastRatio('#000000', background);
  const target = whiteRatio >= blackRatio ? '#ffffff' : '#000000';
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(mixColor(foreground, target, middle), background) >= minimumRatio) high = middle;
    else low = middle;
  }
  return {
    color: mixColor(foreground, target, high),
    adjusted: true,
    shadow: target === '#ffffff' ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.7)',
  };
}
