// Real face recognition running entirely in the browser via face-api.js
import * as faceapi from "https://jsdelivr.net";

// Look directly into your own public/models folder instead of jsdelivr CDN
const MODEL_BASE_URL = "/models";

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

export async function getFaceDescriptor(videoEl) {
  await loadFaceModels();
  const result = await faceapi
    .detectSingleFace(videoEl, DETECTOR_OPTIONS)
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  if (!result) return null;
  return Array.from(result.descriptor);
}

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
