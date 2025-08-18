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
