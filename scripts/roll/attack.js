// scripts/roll/attack.js

/**
 * Execute an attack roll without overriding system logic.
 * Adds support for free-form extra modifiers (dice expressions) via `extraMods`.
 * Keeps legacy numeric miscMod for backward compatibility with older presets.
 */
export async function executeAttack(actor, { itemId, adv, abilityOverride, offHand, extraMods, miscMod }) {
  const item = actor.items.get(itemId);
  if (!item || item.type !== "weapon") return ui.notifications.warn("No weapon.");

  const rollData = actor.getRollData?.() ?? actor.system;
  const sys = item.system ?? {};

  // Determine ability mod: use weapon’s default or override
  const defaultAbility = sys.ability || "str";
  const ability = abilityOverride || defaultAbility;
  const abilityMod = getAbilityMod(actor, ability);

  // Proficiency
  const proficient = !!sys.proficient;
  const profBonus = proficient ? (actor.system?.attributes?.prof ?? 0) : 0;

  // Off-hand adjustment placeholder (neutral by default)
  const offHandMod = offHand ? 0 : 0;

  // Keep numeric miscMod support; extraMods is a string appended to the formula
  const flatBonus = Number(sys.attackBonus || 0) + Number(miscMod || 0) + offHandMod;

  // Compose d20 expression with adv/dis
  const advTag = adv === "adv" ? "kh1" : adv === "dis" ? "kl1" : null;
  const d20 = advTag ? `2d20${advTag}` : "1d20";

  const parts = [d20];
  if (abilityMod) parts.push(sign(abilityMod));
  if (profBonus) parts.push(sign(profBonus));
  if (flatBonus) parts.push(sign(flatBonus));
  if (extraMods && String(extraMods).trim().length) parts.push(String(extraMods).trim());

  const formula = parts.join(" ");

  const R = CONFIG.Dice?.D20Roll ?? Roll;
  const r = new R(formula, rollData, {
    flavor: `${item.name} — ${ability.toUpperCase()} ${proficient ? "+ PROF" : ""}`,
    fastForward: true
  });

  await r.roll({ async: true });

  const breakdown = [
    `${adv === "adv" ? "Advantage" : adv === "dis" ? "Disadvantage" : "Normal"}`,
    `${ability.toUpperCase()} ${signed(abilityMod)}`,
    `${proficient ? `PROF ${signed(profBonus)}` : "No PROF"}`,
    `${flatBonus ? `Mods ${signed(flatBonus)}` : "Mods +0"}`,
    `${extraMods ? `Extra ${extraMods}` : ""}`
  ].filter(Boolean).join(" · ");

  const content = `
  <div class="sw5e-helper-chat">
    <h3>${item.name} — Attack</h3>
    <div><em>${breakdown}</em></div>
    <div class="formula"><code>${formula}</code></div>
  </div>`.trim();

  r.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: content
  });

  return r.total;
}

function getAbilityMod(actor, abil) {
  const v = actor.system?.abilities?.[abil]?.mod;
  return Number.isFinite(v) ? v : 0;
}

function sign(n){ return `${n>=0?"+":""}${n}`; }
const signed = sign;
