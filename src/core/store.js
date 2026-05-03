import { sampleData } from "../data/sample-data.js";

const STORAGE_KEY = "fieldsight-javascript-app-state";

function cloneSeed() {
  return JSON.parse(JSON.stringify(sampleData));
}

export function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : cloneSeed();
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return cloneSeed();
}
