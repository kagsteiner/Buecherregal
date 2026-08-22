function stableHash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function hslToHex({ h, s, l }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const values = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
        : section < 4 ? [0, x, chroma]
          : section < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const offset = l - chroma / 2;
  return `#${values.map((value) => Math.round((value + offset) * 255)
    .toString(16).padStart(2, '0')).join('')}`;
}

export function lightNeutralSpineColor(seed) {
  const hueHash = stableHash(seed);
  const variationHash = stableHash(`${seed}:light-spine`);
  return hslToHex({
    h: hueHash % 360,
    s: 0.08 + (variationHash % 9) / 100,
    l: 0.74 + ((variationHash >>> 8) % 9) / 100,
  });
}
