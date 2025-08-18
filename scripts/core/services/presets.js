// scripts/core/services/presets.js
const NS = "sw5e-helper";
const FLAG_PRESETS = "presets";
const FLAG_LAST = "lastUsed";

/** shape we keep in flags:
 * presets: { attack: [{name, state}], damage: [{name, state}] }
 * lastUsed: { attack: {state}, damage: {state} }
 */

async function _get(actor, key) {
  return (await actor.getFlag(NS, key)) ?? {};
}
async function _set(actor, key, val) {
  return actor.setFlag(NS, key, val);
}

function _ensureShape(store, bucket) {
  if (!store || typeof store !== "object") store = {};
  if (!store[bucket]) store[bucket] = [];
  return store;
}

function _ensureLastShape(store) {
  if (!store || typeof store !== "object") store = {};
  if (!store.attack) store.attack = null;
  if (!store.damage) store.damage = null;
  return store;
}

/** Public API */
export async function listPresets(actor, kind /* "attack" | "damage" */) {
  const store = _ensureShape(await _get(actor, FLAG_PRESETS), kind);
  return store[kind]; // [{name, state}, ...]
}

export async function getPreset(actor, kind, name) {
  const arr = await listPresets(actor, kind);
  return arr.find(p => p.name === name)?.state ?? null;
}

export async function savePreset(actor, kind, name, state) {
  const store = _ensureShape(await _get(actor, FLAG_PRESETS), kind);
  const arr = store[kind];
  const idx = arr.findIndex(p => p.name === name);
  if (idx >= 0) arr[idx] = { name, state }; else arr.push({ name, state });
  await _set(actor, FLAG_PRESETS, store);
  return true;
}

export async function deletePreset(actor, kind, name) {
  const store = _ensureShape(await _get(actor, FLAG_PRESETS), kind);
  store[kind] = store[kind].filter(p => p.name !== name);
  await _set(actor, FLAG_PRESETS, store);
  return true;
}

export async function getLastUsed(actor, kind) {
  const last = _ensureLastShape(await _get(actor, FLAG_LAST));
  return last[kind] ?? null;
}

export async function setLastUsed(actor, kind, state) {
  const last = _ensureLastShape(await _get(actor, FLAG_LAST));
  last[kind] = state;
  await _set(actor, FLAG_LAST, last);
  return true;
}

/** Keep only fields relevant to Attack presets */
export function sanitizeAttackState(state) {
  return {
    weaponId: state.weaponId || "",
    ability: state.ability || "",
    offhand: !!state.offhand,
    atkMods: state.atkMods || "",
    separate: !!state.separate,
    adv: state.adv || "normal",
    // Smart Weapon (persist & load)
    smart: !!state.smart,
    smartAbility: Number(state.smartAbility ?? 0),
    smartProf: Number(state.smartProf ?? 0)
  };
}

export function sanitizeDamageState(state) {
  return {
    weaponId: state.weaponId || "",
    ability: state.ability || "",
    offhand: !!state.offhand,
    dmgMods: state.dmgMods || "",
    separate: !!state.separate,
    adv: state.adv || "normal",
    crit: !!state.crit,
    // Smart Weapon (persist for damage too)
    smart: !!state.smart,
    smartAbility: Number(state.smartAbility ?? 0),
    smartProf: Number(state.smartProf ?? 0)
  };
}

