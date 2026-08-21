export type ContrastCorrection = {
  color: string;
  adjusted: boolean;
  shadow: string;
};

export function contrastRatio(foreground: string, background: string): number | null;
export function ensureTextContrast(
  foreground: string,
  background: string,
  minimumRatio?: number,
): ContrastCorrection;
