/**
 * Execute an attack roll without overriding system logic.
 * We derive ability/proficiency from the weapon, allow overrides,
 * and compose a human-readable formula snippet.
 */
export async function executeAttack(actor, { itemId, adv, abilityOverride, offHand, miscMod }) {
  const item = actor.items.get(itemId);
  if (!item || item.type !== "weapon") return ui.notifications.warn("No weapon.");

  const rollData = actor.getRollData?.() ?? actor.system;
  const sys = item.system ?? {};

  // Determine ability mod: use weapon’s default or override
  const defaultAbility = sys.ability || "str"; // SW5E often mirrors D&D5e; adjust if needed
  const ability = abilityOverride || defaultAbility;
  const abilityMod = getAbilityMod(actor, ability);

  // Proficiency
  const proficient = !!sys.proficient;
  const profBonus = proficient ? (actor.system?.attributes?.prof ?? 0) : 0;

  // Off-hand penalty/bonus (if applicable in your SW5E house rules)
  // Keep this neutral by default; you can wire to system flags later.
  const offHandMod = offHand ? 0 : 0;

  const flatBonus = Number(sys.attackBonus || 0) + Number(miscMod || 0) + offHandMod;

  // Compose d20 expression with adv/dis
  const parts = [];
  const advTag = adv === "adv" ? "kh1" : adv === "dis" ? "kl1" : null;
  const d20 = advTag ? `2d20${advTag}` : "1d20";
  parts.push(d20);
  if (abilityMod) parts.push(sign(abilityMod));
  if (profBonus) parts.push(sign(profBonus));
  if (flatBonus) parts.push(sign(flatBonus));

  const formula = parts.join(" ");

  // Use Foundry's native D20Roll if present for correct flags & 3D dice
  const R = CONFIG.Dice?.D20Roll ?? Roll;
  const r = new R(formula, rollData, {
    flavor: `${item.name} — ${ability.toUpperCase()} ${proficient ? "+ PROF" : ""}`,
    fastForward: true
  });

  await r.roll({ async: true });

  const total = r.total;

  // Human-readable breakdown for chat
  const breakdown = [
    `${adv === "adv" ? "Advantage" : adv === "dis" ? "Disadvantage" : "Normal"}`,
    `${ability.toUpperCase()} ${signed(abilityMod)}`,
    `${proficient ? `PROF ${signed(profBonus)}` : "No PROF"}`,
    `${flatBonus ? `Mods ${signed(flatBonus)}` : "Mods +0"}`
  ].join(" · ");

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

  return total;
}

function getAbilityMod(actor, abil) {
  const v = actor.system?.abilities?.[abil]?.mod;
  return Number.isFinite(v) ? v : 0;
}

function sign(n){ return `${n>=0?"+":""}${n}`; }
function signed(n){ return `${n>=0?"+":""}${n}`; }
