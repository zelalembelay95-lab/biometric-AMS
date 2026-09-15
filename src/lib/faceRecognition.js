// Real face recognition, running entirely in the browser via face-api.js
// (a TensorFlow.js wrapper). Nothing is sent to a server: the camera frame
// is processed locally into a 128-value "descriptor" (a numeric fingerprint
// of the face's geometry), which is what gets stored/compared — never the
// photo itself.
//
// Model files are loaded from a public CDN (jsdelivr, mirroring the
// face-api.js project's own weights) rather than shipped in this repo —
// that's ~6.5MB of binary files nobody wants to upload through a web UI.
// If you'd rather self-host them (offline use, stricter network policy),
// download the three model files below into /public/models and change
// MODEL_BASE_URL to `${import.meta.env.BASE_URL}models`.

import * as faceapi from "https://jsdelivr.net";


const MODEL_BASE_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

let modelsLoaded = false;
let loadingPromise = null;

export function areModelsLoaded() {
  return modelsLoaded;
}

export function loadFaceModels() {
  if (modelsLoaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_BASE_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE_URL),
  ]).then(() => {
    modelsLoaded = true;
  });
  return loadingPromise;
}

const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

// Runs detection + landmarks + the 128-value descriptor on a single video
// frame. Returns null if no face (or more than one) is confidently found —
// enrollment and check-in both require exactly one clear face.
export async function getFaceDescriptor(videoEl) {
  await loadFaceModels();
  const result = await faceapi
    .detectSingleFace(videoEl, DETECTOR_OPTIONS)
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  if (!result) return null;
  return Array.from(result.descriptor); // plain array, JSON/Postgres-friendly
}

// Euclidean distance between two descriptors. face-api.js's own model was
// trained so that ~0.6 is the standard "same person" cutoff — lower means
// more similar. This is the same metric the library's own examples use.
export function faceDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export const FACE_MATCH_THRESHOLD = 0.6;

export function isSamePerson(descriptorA, descriptorB) {
  return faceDistance(descriptorA, descriptorB) < FACE_MATCH_THRESHOLD;
}
