const NS = "sw5e-helper"; const KEY = "presets";

export async function loadPresets(actor) {
  return actor.getFlag(NS, KEY) ?? [];
}

export async function savePreset(actor, preset) {
  const list = await loadPresets(actor);
  const i = list.findIndex(p => p.name === preset.name);
  if (i >= 0) list[i] = preset; else list.push(preset);
  return actor.setFlag(NS, KEY, list);
}

export async function deletePreset(actor, name) {
  const list = await loadPresets(actor);
  return actor.setFlag(NS, KEY, list.filter(p => p.name !== name));
}
