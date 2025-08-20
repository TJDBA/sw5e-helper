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
