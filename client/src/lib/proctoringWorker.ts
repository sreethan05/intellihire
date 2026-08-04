/**
 * Web Worker for Client-Side Proctoring Analysis
 *
 * Performs lightweight face-presence detection using skin-tone region
 * analysis and lighting quality checks. This is NOT a full face recognition
 * or gaze tracking system — it detects whether a face-like region is present
 * in the frame and whether lighting conditions are adequate.
 *
 * ⚠️ FAIRNESS & ACCURACY LIMITATION
 * =================================
 * This worker performs lightweight face-presence detection using skin-tone
 * region analysis. It is NOT a full face recognition or gaze tracking
 * system and has known limitations:
 *
 * - BIAS: The YCbCr skin-tone ranges below are calibrated primarily for
 *   lighter skin tones and may under-detect darker skin tones, leading
 *   to false "face not present" flags for some candidates. The ranges
 *   have been widened to mitigate this, but the heuristic is inherently
 *   imperfect. For production-grade proctoring, integrate face-api.js
 *   or a server-side ML model with diverse training data.
 * - DEFEATABILITY: A printed photograph held up to the camera will pass
 *   this check. Do not rely on this as the sole anti-cheat signal.
 * - LIGHTING: Low-light or overexposed conditions reduce accuracy.
 *
 * Recruiters reviewing proctoring data should be made aware of these
 * limitations before interpreting "face not present" flags.
 *
 * For production-grade proctoring, consider integrating face-api.js or
 * a server-side ML model for true gaze tracking.
 */

export interface FrameAnalysisResult {
  /** A face-like region was detected in the frame */
  facePresent: boolean;
  /** Lighting is too dark or too bright */
  lightAnomalyDetected: boolean;
  /** Confidence score (0-1) for the face presence detection */
  confidence: number;
  timestamp: number;
}

// Skin tone detection ranges (YCbCr color space)
// Widened Y floor (80→40) and Cb range to reduce bias against darker skin
// tones. This is still a crude heuristic — see the fairness note above.
function isSkinTone(r: number, g: number, b: number): boolean {
  // Convert RGB to YCbCr
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  // Widened skin tone ranges in YCbCr for diverse skin tones
  return y > 40 && cb >= 77 && cb <= 140 && cr >= 130 && cr <= 185;
}

self.onmessage = (event: MessageEvent<{ imageData: ImageData; timestamp: number }>) => {
  const { imageData, timestamp } = event.data;
  const data = imageData.data;

  let totalLuminance = 0;
  let skinPixelCount = 0;
  let darkPixelCount = 0;

  // Sample every 4th pixel for performance (4x speedup)
  const step = 16; // every 4th pixel (4 bytes per pixel * 4 = 16)
  let sampledPixels = 0;

  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += luminance;
    sampledPixels++;

    if (luminance < 40) {
      darkPixelCount++;
    }

    if (isSkinTone(r, g, b)) {
      skinPixelCount++;
    }
  }

  const avgLuminance = totalLuminance / sampledPixels;
  const skinRatio = skinPixelCount / sampledPixels;
  const darkRatio = darkPixelCount / sampledPixels;

  // Face presence: skin-tone regions should comprise 5-50% of the frame
  // Too little skin = no face visible, too much = false positive (e.g. wall)
  const facePresent = skinRatio > 0.03 && skinRatio < 0.60 && darkRatio < 0.80;

  // Light anomaly: too dark or too bright to reliably detect face
  const lightAnomalyDetected = avgLuminance < 25 || avgLuminance > 240;

  // Confidence: higher when skin ratio is in the expected range
  let confidence = 0.5;
  if (facePresent) {
    // Peak confidence when skin ratio is around 10-30%
    if (skinRatio > 0.05 && skinRatio < 0.40) {
      confidence = 0.8;
    } else {
      confidence = 0.6;
    }
  } else {
    confidence = 0.3;
  }

  // Reduce confidence if lighting is poor
  if (lightAnomalyDetected) {
    confidence *= 0.5;
  }

  const result: FrameAnalysisResult = {
    facePresent,
    lightAnomalyDetected,
    confidence,
    timestamp,
  };

  self.postMessage(result);
};
