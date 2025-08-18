import { getWeaponById } from "../adapter/sw5e.js";
import { applyCritToDiceOnly, addBrutalDiceAfterCrit } from "../services/math.js";

export async function rollDamage({ actor, weaponId, state }) {
  const item = getWeaponById(actor.actor, weaponId);
  if (!item) return ui.notifications.warn("No weapon.");

  const parts = Array.from(item.system?.damage?.parts ?? []); // [["1d10","kinetic"], ...]
  if (!parts.length) return ui.notifications.warn("Weapon has no damage.");

  const abilityMod = state.smart ? Number(state.smartAbility || 0) : (actor.abilities?.[state.ability || ""]?.mod ?? 0);

  const critted = parts.map(([f, t], idx) => [ state.crit ? applyCritToDiceOnly(f) : f, t, idx === 0 ]);

  const brutal = Number(item.system?.properties?.brutal ?? item.system?.brutal ?? 0);
  const withBrutal = addBrutalDiceAfterCrit(critted, brutal);

  if (state.dmgMods) withBrutal.push([`(${state.dmgMods})`, "—", false]);

  if (!state.separate && state.superiority) withBrutal.push(["1d8", "—", false]); // TODO: detect die size

  const chunks = withBrutal.map(([f, t, isPrimary]) => {
    const add = isPrimary && !state.offhand ? ` + ${abilityMod}` : "";
    return `( ${f}${add} )[${t}]`;
  });

  const advTag = state.adv === "adv" ? "kh1" : state.adv === "dis" ? "kl1" : "";
  const expr = advTag ? `2d1${advTag} * 0 + ${chunks.join(" + ")}` : chunks.join(" + ");

  const roll = await (new (CONFIG.Dice?.DamageRoll ?? Roll)(expr, actor.actor.getRollData?.() ?? {})).roll({ async: true });

  const badges = [
    state.crit ? "CRIT" : null,
    brutal ? `Brutal ${brutal}` : null,
    state.offhand ? "Offhand (no ability to dmg)" : null,
    (!state.separate && state.superiority) ? "Superiority die (remember to activate maneuver)" : null
  ].filter(Boolean).join(" • ");

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: actor.actor }),
    flavor: `${item.name} — Damage${badges ? ` · ${badges}` : ""}<div><code>${expr}</code></div>`
  });

  return roll;
}
