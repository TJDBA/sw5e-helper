const _packs = new Map();

export function registerPack(pack) { _packs.set(pack.id, pack); }
export function allPacks() { return Array.from(_packs.values()); }
export function availablePacks(actor, weapon, state) {
  return allPacks().filter(p => p.available?.(actor, weapon, state));
}
