// scripts/core/adapter/sw5e.js
// Adapter helpers for Attack Dialog smart weapons & saves

function isEquipped(item) {
  const sys = item.system ?? {};
  // Handle boolean or nested .value forms
  const eq = sys.equipped;
  return !!(eq === true || eq === "true" || (typeof eq === "object" && eq?.value === true));
}

export function normalizeActor(actor) {
  return {
    actor,
    abilities: actor.system?.abilities ?? {},
    prof: actor.system?.attributes?.prof ?? 0
  };
}

export function listEquippedWeapons(actor) {
  const all = actor.items.filter(i => i.type === "weapon");
  let list = all.filter(isEquipped);
  // If nothing is marked equipped (data oddities), fall back to all weapons so nothing "disappears"
  if (!list.length) {
    console.warn("SW5E Helper: no items flagged equipped; falling back to all weapons.");
    list = all;
  }
  return list.map(i => ({ id: i.id, name: i.name, item: i }));
}

export function getWeaponById(actor, id) {
  return actor.items.get(id);
}

/** Extract a flat numeric constant from a string/number like "+1" or "2". */
function _constNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (/[@dD]/.test(s)) return 0;             // reject formulas like "@prof" or "1d4"
  const n = Number(s.replace(/^\+/, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Read save data from an item (system.save.{ability,dc} or legacy saveAbility/saveDC). */
export function getSaveForItem(item) {
  const sys = item?.system ?? {};
  const ability = sys.save?.ability ?? sys.saveAbility ?? null;
  const dcRaw   = sys.save?.dc ?? sys.saveDC;
  const dc      = _constNumber(dcRaw);
  if (!ability || !Number.isFinite(dc)) return null;
  return { ability, dc };
}

/** Parse SMART defaults from description when item.system.properties.smr is true. Pattern: SMART (17/+3). */
export function parseSmartDefaults(item) {
  const isSmart = !!item?.system?.properties?.smr;
  if (!isSmart) return null;
  const raw  = item?.system?.description?.value ?? item?.system?.description ?? "";
  const text = String(raw).replace(/<[^>]*>/g, " ");
  const m = text.match(/smart\s*\(\s*(\d+)\s*\/\s*\+?(\d+)\s*\)/i);
  if (!m) return null;
  const score = Number(m[1]), prof = Number(m[2]);
  if (!Number.isFinite(score) || !Number.isFinite(prof)) return null;
  const abilityMod = Math.floor((score - 10) / 2);
  return { abilityMod, profBonus: prof };
}

/** Get the item's flat attack bonus (+X from a +1 weapon, etc.) for display and DC math (not extra mods). */
export function getItemAttackBonus(actor, item) {
  const sys = item?.system ?? {};
  const direct =
    _constNumber(sys.attackBonus) ||
    _constNumber(sys.attack?.bonus);
  if (direct) return direct;

  const fromBonuses =
    _constNumber(sys.bonuses?.weapon?.attack) ||
    _constNumber(sys.bonuses?.mwak?.attack) ||
    _constNumber(sys.bonuses?.rwak?.attack);
  return fromBonuses || 0;
}

/** Resolve "sceneId:tokenId" into { scene, token, actor } */
export function resolveTokenRef(ref) {
  const [sceneId, tokenId] = (ref || "").split(":");
  const scene = game.scenes.get(sceneId);
  const token = scene?.tokens?.get(tokenId);
  const actor = token?.actor ?? null;
  return { scene, token, actor };
}

/**
 * Apply damage to a token's actor, returning the effective damage applied.
 * PLACEHOLDERS:
 *  - TODO: integrate damage resistances / immunities / reductions
 *  - TODO: surface/queue reactions before applying (e.g., Uncanny Dodge)
 */
export async function applyDamageToToken(ref, amount, { half = false } = {}) {
  const { actor } = resolveTokenRef(typeof ref === "string" ? ref : `${ref.sceneId}:${ref.tokenId}`);
  if (!actor) return 0;

  // Placeholder hooks (no-op for now)
  // const mitigated = await Hooks.call("sw5e-helper.preApplyDamage", { actor, amount, half });
  // if (mitigated === false) return 0;

  let dmg = Number(amount) || 0;
  if (half) dmg = Math.floor(dmg / 2);

  // TODO: apply resistances/reductions here (placeholder)
  // e.g., dmg = applyMitigations(actor, dmg);

  const hp = actor.system?.attributes?.hp;
  if (!hp) return 0;

  const before = Number(hp.value ?? 0);
  const after = Math.max(0, before - dmg);

  await actor.update({ "system.attributes.hp.value": after });

  // Placeholder post-hook
  // Hooks.callAll("sw5e-helper.postApplyDamage", { actor, applied: before - after });

  return before - after;
}