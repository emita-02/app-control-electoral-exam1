export const minimumSharpnessScore = 2_000;

export function calculateLaplacianVariance(
  rgba: Uint8Array,
  width: number,
  height: number,
): number {
  if (
    width < 3 ||
    height < 3 ||
    rgba.length !== width * height * 4
  ) {
    throw new Error('La imagen no contiene suficientes píxeles para analizar su nitidez.');
  }

  const luminanceAt = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return (
      rgba[index] * 0.299 +
      rgba[index + 1] * 0.587 +
      rgba[index + 2] * 0.114
    );
  };

  let sum = 0;
  let squaredSum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const laplacian =
        4 * luminanceAt(x, y) -
        luminanceAt(x - 1, y) -
        luminanceAt(x + 1, y) -
        luminanceAt(x, y - 1) -
        luminanceAt(x, y + 1);
      sum += laplacian;
      squaredSum += laplacian * laplacian;
      count += 1;
    }
  }

  const mean = sum / count;
  return squaredSum / count - mean * mean;
}
