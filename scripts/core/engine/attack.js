// scripts/core/engine/attack.js
import { getWeaponById } from "../adapter/sw5e.js";

const signed = n => `${n >= 0 ? "+" : ""}${n}`;
const DEBUG = true;

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
  if (DEBUG) console.log("SW5E DEBUG: Running rollAttack()", actor, state);

  const item = getWeaponById(actor.actor, weaponId);
  if (!item) return ui.notifications.warn("No weapon selected.");

  // abilityKey is still derived from item or user selection
  const usingSmart = !!state.smart;
  const abilityKey = state.ability || deriveDefaultAbility(item);
  const abilityMod = usingSmart? Number(state.smartAbility ?? 0) : (actor.abilities?.[abilityKey]?.mod ?? 0);
  const profBonus = usingSmart? Number(state.smartProf ?? 0) : (item.system?.proficient ? (actor.prof ?? 0) : 0);
  const itemAtk = Number(item.system?.attackBonus || 0);


  // === Adv/Dis expression ===
  const advTag = state.adv === "adv" ? "kh1" : state.adv === "dis" ? "kl1" : "";
  const d20 = advTag ? `2d20${advTag}` : "1d20";

  //  const parts = [d20];
  //  if (abilityMod) parts.push(signed(abilityMod));
  //  if (profBonus)  parts.push(signed(profBonus));
  //  if (itemAtk)    parts.push(signed(itemAtk));
  //  if (state.atkMods) parts.push(`(${state.atkMods})`);
  //  const formula = parts.join(" ");

  const parts = [d20];
  if (abilityMod) parts.push(signed(abilityMod));
  if (profBonus)  parts.push(signed(profBonus));
  if (itemAtk)    parts.push(signed(itemAtk));

  // --- FIX: normalize user Attack Mod expression ---
  let atkExpr = (state.atkMods || "").trim();
  if (atkExpr) {
    if (/^[+\-]/.test(atkExpr)) {
      // User already started with + or -, keep as-is (optional: wrap)
      parts.push(atkExpr);
    } else {
      // No leading operator → add a plus and group it
      parts.push(`+ (${atkExpr})`);
    }
  }

  const formula = parts.join(" ");


  //const R = (CONFIG.Dice && (CONFIG.Dice.D20Roll || CONFIG.Dice.Roll)) || Roll;
  const R = Roll;
  const data = actor.actor.getRollData?.() ?? {};
  const targets = Array.from(game.user?.targets ?? []);

  // DEBUG: dump everything to the console
  if (DEBUG) console.log("SW5E Helper (engine) attack debug:", {
    state: structuredClone(state),
    abilityKey, abilityMod, profBonus, itemAtk,
    advTag, d20, formula,
    targets: targets.map(t => ({ id: t.id, name: t.name }))
  });

  // Helper to roll once (with DSN animation)
  const makeRoll = async () => {
    const r = new R(formula, data);
    if (typeof r.evaluate === "function") await r.evaluate({ async: true });
    else if (typeof r.roll === "function") await r.roll({ async: true });
    
    // Manually trigger DSN animation since we're not creating a chat message
    try { 
      await game.dice3d?.showForRoll?.(r, game.user, true); 
    } catch (_) {
      if (DEBUG) console.log("SW5E DEBUG: DSN animation failed or not available");
    }
    
    return r;
  };

  // Build target results for the new card system
  const targetResults = [];
  const rolls = [];

  if (state.separate && targets.length > 1) {
    for (const t of targets) {
      const r = await makeRoll();
      rolls.push(r);
      const o = judgeAgainstTarget(r, r.total, t, item);
      const nat = keptNatD20(r);
      targetResults.push({
        tokenId: t.id,
        kept: nat,
        total: r.total,
        status: o.status === "Critical Hit" ? "crit" : 
                o.status === "Hit" ? "hit" : 
                o.status === "Critical Miss" ? "fumble" : "miss"
      });
    }
  } else {
    const r = await makeRoll();
    rolls.push(r);
    if (targets.length) {
      for (const t of targets) {
        const o = judgeAgainstTarget(r, r.total, t, item);
        const nat = keptNatD20(r);
        targetResults.push({
          tokenId: t.id,
          kept: nat,
          total: r.total,
          status: o.status === "Critical Hit" ? "crit" : 
                  o.status === "Hit" ? "hit" : 
                  o.status === "Critical Miss" ? "fumble" : "miss"
        });
      }
    }
  }

  if (DEBUG) console.log("SW5E DEBUG: Attack results", { targetResults, rolls });

  // Return the results instead of creating a chat message
  return {
    targets: targetResults,
    rolls,
    info: `${abilityKey.toUpperCase()} ${signed(abilityMod)} + Prof ${signed(profBonus)} + Item ${signed(itemAtk)}`
  };
}
