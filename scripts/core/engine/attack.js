import { getWeaponById } from "../adapter/sw5e.js";

const signed = n => `${n >= 0 ? "+" : ""}${n}`;

function deriveDefaultAbility(item) {
  const sys = item.system ?? {};
  if (sys.ability) return sys.ability;
  const type = sys.actionType || sys.activation?.type;
  const ranged = type?.startsWith?.("r");
  const finesse = sys.properties?.fin || sys.properties?.finesse;
  return (ranged || finesse) ? "dex" : "str";
}

// SW5E keen / expanded crit range (e.g., 19) else 20
function getCritThreshold(item) {
  const t = Number(item.system?.critical?.threshold);
  return Number.isFinite(t) && t >= 1 ? t : 20;
}

// Kept natural d20 (after kh/kl)
function keptNatD20(roll) {
  const d20 = roll.dice?.find(d => d.faces === 20);
  if (!d20) return null;
  const kept = d20.results?.find(r => !r.discarded);
  return kept?.result ?? d20.results?.[0]?.result ?? null;
}

// Show both d20s when adv/dis was used
function d20DetailText(roll) {
  const d20 = roll.dice?.find(d => d.faces === 20);
  if (!d20) return "";
  const vals = (d20.results || []).map(r => r.result);
  const kept = keptNatD20(roll);
  if (vals.length <= 1) return ` (d20=${kept})`;
  // e.g. (d20=17; rolled 12,17)
  return ` (d20=${kept}; rolled ${vals.join(",")})`;
}

function judgeAgainstTarget(roll, total, targetToken, item) {
  const nat = keptNatD20(roll);
  const critThreshold = getCritThreshold(item);
  const autoHit = nat === 20;

  if (nat === 1) return { status: "Critical Miss", nat, hit: false, crit: false, detail: d20DetailText(roll) };

  const tActor = targetToken?.actor;
  const ac = tActor?.system?.attributes?.ac?.value ?? tActor?.system?.attributes?.ac ?? null;

  let hit = false;
  if (autoHit) hit = true;
  else if (Number.isFinite(ac)) hit = total >= ac;

  // Keen: nat >= threshold crits only if it hits; nat 20 always hits (and thus crits)
  const crit = hit && nat != null && nat >= critThreshold;

  return {
    status: crit ? "Critical Hit" : (hit ? "Hit" : "Miss"),
    nat, hit, crit,
    detail: d20DetailText(roll)
  };
}

export async function rollAttack({ actor, weaponId, state }) {
  const item = getWeaponById(actor.actor, weaponId);
  if (!item) return ui.notifications.warn("No weapon selected.");

  const abilityKey = state.ability || deriveDefaultAbility(item);
  const abilityMod = actor.abilities?.[abilityKey]?.mod ?? 0;
  const profBonus  = item.system?.proficient ? (actor.prof ?? 0) : 0;
  const itemAtk    = Number(item.system?.attackBonus || 0);

  // Real adv/dis
  const advTag = state.adv === "adv" ? "kh1" : state.adv === "dis" ? "kl1" : "";
  const d20 = advTag ? `2d20${advTag}` : "1d20";

  const parts = [d20];
  if (abilityMod) parts.push(signed(abilityMod));
  if (profBonus)  parts.push(signed(profBonus));
  if (itemAtk)    parts.push(signed(itemAtk));
  if (state.atkMods) parts.push(`(${state.atkMods})`);
  const formula = parts.join(" ");

  const R = (CONFIG.Dice && (CONFIG.Dice.D20Roll || CONFIG.Dice.Roll)) || Roll;
  const data = actor.actor.getRollData?.() ?? {};
  const targets = Array.from(game.user?.targets ?? []);

  // Make a roll (no manual Dice So Nice call — DSN will animate from the chat message)
  const makeRoll = async () => {
    const r = new R(formula, data);
    if (typeof r.evaluate === "function") await r.evaluate({ async: true });
    else if (typeof r.roll === "function") await r.roll({ async: true });
    return r;
  };

  // Single combined card
  const lines = [];
  const rolls = [];

  if (state.separate && targets.length > 1) {
    for (const t of targets) {
      const r = await makeRoll();
      rolls.push(r);
      const o = judgeAgainstTarget(r, r.total, t, item);
      lines.push(
        `<li><a class="sw5e-helper-target" data-scene="${canvas.scene?.id}" data-token="${t.id}">${t.name}</a>: <b>${o.status}</b>${o.detail} — total ${r.total}</li>`
      );
    }
  } else {
    const r = await makeRoll();
    rolls.push(r);
    if (targets.length) {
      for (const t of targets) {
        const o = judgeAgainstTarget(r, r.total, t, item);
        lines.push(
          `<li><a class="sw5e-helper-target" data-scene="${canvas.scene?.id}" data-token="${t.id}">${t.name}</a>: <b>${o.status}</b>${o.detail} — total ${r.total}</li>`
        );
      }
    }
  }

  const header = `${item.name} — Attack${targets.length ? "" : " (no target)"} · ${state.adv.toUpperCase()}`;
  const sub = `<small>${abilityKey.toUpperCase()} ${signed(abilityMod)} · ${item.system?.proficient ? "PROF" : "No PROF"} ${signed(profBonus)}</small>`;
  const list = lines.length ? `<ul style="margin:.5em 1em;">${lines.join("")}</ul>` : "";
  const formulaHtml = `<code>${formula}</code>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor.actor }),
    flavor: `${header}<div>${sub}<br>${formulaHtml}</div>${list}`,
    type: (CONST?.CHAT_MESSAGE_TYPES?.ROLL ?? 5),
    rolls
  });
}
