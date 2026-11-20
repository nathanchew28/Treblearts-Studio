/**
 * Client-side Optical Music Recognition (OMR) image pre-processor
 * Implements open-source OMR computer vision stages (inspired by BreezeWhite/oemer & liebharc/homr):
 *  1. High-resolution canvas scaling (normalized to ~1500px wide for crisp small noteheads)
 *  2. Local background illumination flattening & contrast stretch
 *  3. Otsu adaptive binarization for razor-sharp staff lines, noteheads, sharps, and stems
 *  4. Horizontal Projection Profile (HPP) 5-line staff & grand-staff system detection
 */

export interface OmrPreprocessResult {
  enhancedDataUrl: string;
  enhancedMimeType: string;
  width: number;
  height: number;
  staffCount: number;
  systemCount: number;
  estimatedLayout: 'grand-staff' | 'single-staff' | 'unknown';
  lineSpacingPx: number;
  staffCentersY: number[];
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode sheet music image.'));
    img.src = dataUrl;
  });
}

function computeOtsuThreshold(histogram: Uint32Array, totalPixels: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let threshold = 135;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVar > maxVariance) {
      maxVariance = betweenVar;
      threshold = t;
    }
  }
  return threshold;
}

function detectStavesFromProjection(
  binaryDarkness: Uint8Array,
  width: number,
  height: number
): { staffCentersY: number[]; lineSpacingPx: number } {
  // Horizontal Projection Profile (dark pixel ratio per scanline row)
  const rowDensity = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let dark = 0;
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      dark += binaryDarkness[offset + x];
    }
    rowDensity[y] = dark / width;
  }

  // Staff line candidate rows typically have >= 22% horizontal ink across page width
  const candidateRows: number[] = [];
  for (let y = 2; y < height - 2; y++) {
    const d = rowDensity[y];
    if (
      d >= 0.22 &&
      d >= rowDensity[y - 1] &&
      d >= rowDensity[y + 1]
    ) {
      if (candidateRows.length === 0 || y - candidateRows[candidateRows.length - 1] >= 4) {
        candidateRows.push(y);
      }
    }
  }

  // Group sets of 5 evenly-spaced rows into 5-line musical staves
  const staffCentersY: number[] = [];
  const spacings: number[] = [];

  let i = 0;
  while (i + 4 < candidateRows.length) {
    const diffs = [
      candidateRows[i + 1] - candidateRows[i],
      candidateRows[i + 2] - candidateRows[i + 1],
      candidateRows[i + 3] - candidateRows[i + 2],
      candidateRows[i + 4] - candidateRows[i + 3],
    ];
    const avg = diffs.reduce((a, b) => a + b, 0) / 4;
    const isRegularStaff =
      avg >= 4 &&
      avg <= 36 &&
      diffs.every((d) => Math.abs(d - avg) <= Math.max(2.5, avg * 0.35));

    if (isRegularStaff) {
      const center = (candidateRows[i] + candidateRows[i + 4]) / 2;
      staffCentersY.push(Math.round(center));
      spacings.push(avg);
      i += 5;
    } else {
      i += 1;
    }
  }

  const medianSpacing =
    spacings.length > 0
      ? Number(
          (spacings.sort((a, b) => a - b)[Math.floor(spacings.length / 2)]).toFixed(1)
        )
      : 0;

  return { staffCentersY, lineSpacingPx: medianSpacing };
}

export async function preprocessSheetMusicPhoto(dataUrl: string): Promise<OmrPreprocessResult> {
  const img = await loadImage(dataUrl);
  const targetWidth = Math.min(1600, Math.max(1000, img.naturalWidth || img.width || 1200));
  const aspect = (img.naturalHeight || img.height || 900) / Math.max(1, img.naturalWidth || img.width || 1200);
  const width = Math.round(targetWidth);
  const height = Math.round(targetWidth * aspect);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      enhancedDataUrl: dataUrl,
      enhancedMimeType: 'image/jpeg',
      width,
      height,
      staffCount: 0,
      systemCount: 0,
      estimatedLayout: 'unknown',
      lineSpacingPx: 0,
      staffCentersY: [],
    };
  }

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  // 1. Convert to luminance & build histogram for quantile stretch + Otsu
  const lum = new Uint8Array(totalPixels);
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    lum[p] = y;
    hist[y]++;
  }

  // Find 2% and 95% luminance percentiles to normalize warm/shadowed paper photos
  let acc = 0;
  let lowP = 0;
  let highP = 255;
  for (let t = 0; t < 256; t++) {
    acc += hist[t];
    if (acc <= totalPixels * 0.02) lowP = t;
    if (acc <= totalPixels * 0.95) highP = t;
  }
  const range = Math.max(32, highP - lowP);

  const normHist = new Uint32Array(256);
  for (let p = 0; p < totalPixels; p++) {
    const stretched = Math.max(0, Math.min(255, Math.round(((lum[p] - lowP) * 255) / range)));
    lum[p] = stretched;
    normHist[stretched]++;
  }

  const otsu = computeOtsuThreshold(normHist, totalPixels);
  // Slightly conservative bias (-10) preserves thin staff lines without bloating noteheads
  const softDarkCutoff = Math.max(40, otsu - 8);
  const binaryDarkness = new Uint8Array(totalPixels);

  // Create high-contrast crisp grayscale output preserving subtle anti-aliased note stems/dots
  for (let p = 0, i = 0; p < totalPixels; p++, i += 4) {
    const v = lum[p];
    const isInk = v < softDarkCutoff;
    binaryDarkness[p] = isInk ? 1 : 0;

    // Gentle S-curve contrast boost rather than pure 1-bit dithering keeps tiny dots/accidentals crisp
    let cleanGray = 255;
    if (v < otsu - 24) {
      cleanGray = Math.max(0, Math.round(v * 0.35));
    } else if (v < otsu + 18) {
      cleanGray = Math.round(((v - (otsu - 24)) / 42) * 205);
    }

    data[i] = cleanGray;
    data[i + 1] = cleanGray;
    data[i + 2] = cleanGray;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  const { staffCentersY, lineSpacingPx } = detectStavesFromProjection(
    binaryDarkness,
    width,
    height
  );

  // Detect grand staff pairs (two adjacent staves separated by < ~16 * lineSpacingPx)
  const staffCount = staffCentersY.length;
  let systemCount = staffCount;
  let estimatedLayout: OmrPreprocessResult['estimatedLayout'] =
    staffCount > 0 ? 'single-staff' : 'unknown';

  if (staffCount >= 2 && lineSpacingPx > 0) {
    let pairs = 0;
    for (let s = 0; s + 1 < staffCount; s++) {
      const gap = staffCentersY[s + 1] - staffCentersY[s];
      if (gap <= lineSpacingPx * 18) {
        pairs++;
        s++; // skip second staff of pair
      }
    }
    if (pairs > 0) {
      estimatedLayout = 'grand-staff';
      systemCount = pairs;
    }
  }

  const enhancedDataUrl = canvas.toDataURL('image/png');
  return {
    enhancedDataUrl,
    enhancedMimeType: 'image/png',
    width,
    height,
    staffCount,
    systemCount,
    estimatedLayout,
    lineSpacingPx,
    staffCentersY,
  };
}
