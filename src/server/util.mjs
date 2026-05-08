export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function deepMerge(target, patch) {
  if (!patch || typeof patch !== "object") return target;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "v" || key === "time") continue;
    if (Array.isArray(value)) {
      target[key] = value.map((item) => clone(item));
    } else if (value && typeof value === "object" && !Array.isArray(target[key])) {
      target[key] = deepMerge(target[key] && typeof target[key] === "object" ? target[key] : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

