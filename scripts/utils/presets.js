const FLAG_SCOPE = "sw5e-helper";
const FLAG_KEY = "presets";

export async function getPresets(actor) {
  return actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? [];
}

export async function savePreset(actor, preset) {
  const existing = await getPresets(actor);
  const next = upsert(existing, preset, (a,b)=>a.name===b.name);
  return actor.setFlag(FLAG_SCOPE, FLAG_KEY, next);
}

export async function deletePreset(actor, name) {
  const existing = await getPresets(actor);
  return actor.setFlag(FLAG_SCOPE, FLAG_KEY, existing.filter(p => p.name !== name));
}

function upsert(arr, item, eq) {
  const i = arr.findIndex(x => eq(x, item));
  if (i >= 0) { arr[i] = item; return arr; }
  return [...arr, item];
}
