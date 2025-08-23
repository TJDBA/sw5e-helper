// scripts/core/engine/damage.js
import { getWeaponById } from "../adapter/sw5e.js";

const signed = n => `${n >= 0 ? "+" : ""}${n}`;

// Feature flip: allow ability mod to damage on off-hand attacks
const ALLOW_OFFHAND_DAMAGE_MOD = false;

/* ----------------------------- helpers ----------------------------- */

function deriveDefaultAbility(item) {
  const sys = item.system ?? {};
  if (sys.ability) return sys.ability;
  const type = sys.actionType || sys.activation?.type;
  const ranged = type?.startsWith?.("r");
  const finesse = sys.properties?.fin || sys.properties?.finesse;
  return (ranged || finesse) ? "dex" : "str";
}

// SW5E Brutal is stored as a short property flag `system.properties.bru`
function getBrutal(item) {
  const p = item.system?.properties ?? {};
  if (typeof p.bru === "number") return p.bru;
  if (p.bru === true) return 1;
  return 0;
}

const DIE_RE = /(\d+)d(\d+)(?:\s*min\s*(\d+))?/gi; // NdF [minY]

// Double only dice, preserve any existing min
function doubleDice(formula) {
  return String(formula || "").replace(DIE_RE, (_, n, f, min) => {
    const N = Number(n) * 2;
    return `${N}d${f}${min ? `min${min}` : ""}`;
  });
}

// Per-face minimums table
const MIN_BY_FACES = { 4: 2, 6: 2, 8: 3, 10: 4, 12: 5, 20: 8 };

// Apply per-face minimums, preserving the higher of existing vs table
function applyMinByFaces(formula) {
  return String(formula || "").replace(DIE_RE, (_, n, f, min) => {
    const faces = Number(f);
    const wanted = MIN_BY_FACES[faces];
    if (!wanted) return `${n}d${f}${min ? `min${min}` : ""}`;
    const eff = Math.max(Number(min ?? 0), wanted);
    return `${n}d${f}min${eff}`;
  });
}

// Find first NdF in a formula to determine faces for Brutal
function firstDieFaces(formula) {
  const m = [...String(formula || "").matchAll(DIE_RE)][0];
  return m ? Number(m[2]) : null;
}

// Build weapon damage formulas (array of strings) and whether they use @mod
function weaponParts(item) {
  const parts = (item.system?.damage?.parts || []).map(([f]) => String(f));
  const usesAtMod = parts.some(f => /@mod\b/.test(f));
  return { parts, usesAtMod };
}

// FIXED: Damage type to DSN color mapping
function getDamageTypeColor(damageType) {
  const colorMap = {
    kinetic: "#8B4513",    // brown
    energy: "#FF4500",     // orange-red  
    ion: "#00BFFF",        // deep sky blue
    acid: "#32CD32",       // lime green
    cold: "#87CEEB",       // sky blue
    fire: "#DC143C",       // crimson
    force: "#9370DB",      // medium purple
    lightning: "#FFD700",  // gold
    necrotic: "#2F4F4F",   // dark slate gray
    poison: "#9ACD32",     // yellow green
    psychic: "#DA70D6",    // orchid
    sonic: "#FF69B4",      // hot pink
    true: "#FFFFFF"        // white
  };
  return colorMap[damageType?.toLowerCase()] || "#FFFFFF";
}

/* ----------------------------- MAIN ENGINE ----------------------------- */

// CONSOLIDATED: Single damage rolling function that handles all cases
export async function rollDamageForTargets({ actor, item, dmgState, targetRefs = [], critMap = {}, separate = false }) {
  console.log("SW5E DEBUG: rollDamageForTargets ENTRY", { 
    weaponName: item?.name, 
    dmgState, 
    targetRefs, 
    critMap,
    separate
  });

  const { parts: baseParts, usesAtMod } = weaponParts(item);
  const base = baseParts.join(" + ") || "0";
  const brutalVal = getBrutal(item);
  const faces = firstDieFaces(base);

  console.log("SW5E DEBUG: Weapon damage formula", { base, usesAtMod, brutalVal, faces });

  // ability mod (smart or chosen) with off-hand rule
  const abilityKey = dmgState.ability || item?.system?.ability || deriveDefaultAbility(item);
  let abilityMod = dmgState.smart ? Number(dmgState.smartAbility ?? 0)
                                  : Number(foundry.utils.getProperty(actor, `system.abilities.${abilityKey}.mod`) ?? 0);
  if (dmgState.offhand && abilityMod > 0) abilityMod = 0;

  const extras = Array.isArray(dmgState.extraRows) ? dmgState.extraRows : [];

  const makeFormula = (isCrit) => {
    let f = isCrit ? doubleDice(base) : base;
    if (isCrit && brutalVal > 0 && faces) f = `${f} + ${brutalVal}d${faces}`;
    if (!usesAtMod && abilityMod) f = `${f} + ${signed(abilityMod)}`;
    
    // Add extra damage modifiers
    for (const r of extras) {
      if (!r?.formula) continue;
      const chunk = (isCrit && r.inCrit) ? doubleDice(r.formula) : r.formula;
      f = `${f} + (${chunk})`;
    }
    return f;
  };

  const doRoll = async (isCrit, rollContext = "", damageType = "kinetic") => {
    const formula = makeFormula(isCrit);
    const data = usesAtMod ? { mod: abilityMod } : {};
    console.log(`SW5E DEBUG: doRoll(${isCrit}) ${rollContext}`, { formula, data, damageType });
    
    const roll = await (new Roll(formula, data)).evaluate({ async: true });
    console.log(`SW5E DEBUG: Roll result ${rollContext}`, { total: roll.total, formula: roll.formula });
    
    // FIXED: Apply damage type color to DSN
    try { 
      await game.dice3d?.showForRoll?.(roll, game.user, true, null, false, null, {
        colorset: getDamageTypeColor(damageType)
      }); 
    } catch (_) {
      // Fallback without color if DSN doesn't support it
      try {
        await game.dice3d?.showForRoll?.(roll, game.user, true);
      } catch (_) {}
    }
    return roll;
  };

  // Determine primary damage type for DSN coloring
  const primaryDamageType = (item.system?.damage?.parts?.[0]?.[1]) || "kinetic";

  const perTargetTotals = new Map();
  const perTargetTypes = new Map();
  const rolls = [];
  let info = "";

  if (!targetRefs.length) {
    // Manual mode, no targets selected: single roll using global crit toggle
    const r = await doRoll(!!dmgState.isCrit, "- manual no targets", primaryDamageType);
    rolls.push(r);
    return { 
      perTargetTotals, 
      perTargetTypes, 
      rolls, 
      singleTotal: r.total ?? 0, 
      info: `${makeFormula(!!dmgState.isCrit)} = ${r.total}`
    };
  }

  if (separate) {
    // Roll once per target using individual crit status
    console.log("SW5E DEBUG: Separate rolls mode");
    for (const ref of targetRefs) {
      const r = await doRoll(!!critMap[ref], `- separate for ${ref}`, primaryDamageType);
      rolls.push(r);
      const total = r.total ?? 0;
      perTargetTotals.set(ref, total);
      perTargetTypes.set(ref, { [primaryDamageType]: total }); // Use actual damage type
    }
    info = `Per-target rolls using individual crit status`;
  } else {
    // Shared roll with mixed crit logic
    const critRefs = targetRefs.filter(ref => !!critMap[ref]);
    const hitRefs  = targetRefs.filter(ref => !critMap[ref]);

    if (!critRefs.length || !hitRefs.length) {
      // Uniform case: all same type, one roll applied to all
      const isCrit = !!critRefs.length;
      console.log("SW5E DEBUG: Uniform case - all same type", { isCrit, critRefs: critRefs.length, hitRefs: hitRefs.length });
      const r = await doRoll(isCrit, "- uniform case", primaryDamageType); 
      rolls.push(r);
      const total = r.total ?? 0;
      
      for (const ref of targetRefs) {
        perTargetTotals.set(ref, total);
        perTargetTypes.set(ref, { [primaryDamageType]: total }); // Use actual damage type
      }
      info = `${makeFormula(isCrit)} = ${total}`;
    } else {
      // Mixed case: base roll + crit extra roll
      console.log("SW5E DEBUG: Mixed case - some crits, some hits", { critRefs, hitRefs });
      
      // Base roll (non-crit)
      const baseRoll = await doRoll(false, "- mixed case base", primaryDamageType);
      rolls.push(baseRoll);
      const baseTotal = baseRoll.total ?? 0;

      // Crit extra: only duplicate dice + brutal
      const diceOnly = (s) => {
        const matches = s.match(/(\d+d\d+)/gi);
        return matches ? matches.join(" + ") : "0";
      };
      
      let critExtra = diceOnly(base);
      for (const r of extras) {
        if (!r?.formula || !r.inCrit) continue;
        const d = diceOnly(r.formula);
        if (d && d !== "0") critExtra = critExtra ? `${critExtra} + ${d}` : d;
      }
      if (brutalVal > 0 && faces) critExtra = critExtra ? `${critExtra} + ${brutalVal}d${faces}` : `${brutalVal}d${faces}`;

      console.log("SW5E DEBUG: Crit extra formula", { critExtra });
      const extraRoll = await (new Roll(critExtra || "0")).evaluate({ async: true });
      console.log("SW5E DEBUG: Crit extra roll", { total: extraRoll.total });
      
      // FIXED: Apply damage type color to crit extra roll too
      try { 
        await game.dice3d?.showForRoll?.(extraRoll, game.user, true, null, false, null, {
          colorset: getDamageTypeColor(primaryDamageType)
        }); 
      } catch (_) {
        try { await game.dice3d?.showForRoll?.(extraRoll, game.user, true); } catch (_) {}
      }
      
      rolls.push(extraRoll);
      const extraTotal = extraRoll.total ?? 0;

      // Apply totals
      for (const ref of hitRefs) {
        perTargetTotals.set(ref, baseTotal);
        perTargetTypes.set(ref, { [primaryDamageType]: baseTotal });
      }
      for (const ref of critRefs) {
        const total = baseTotal + extraTotal;
        perTargetTotals.set(ref, total);
        perTargetTypes.set(ref, { [primaryDamageType]: total });
      }
      info = `Base: ${makeFormula(false)} = ${baseTotal}  +  Crit Extra: ${critExtra || "0"} = ${extraTotal}`;
    }
  }

  console.log("SW5E DEBUG: rollDamageForTargets RESULT", { perTargetTotals, perTargetTypes, rolls: rolls.length, info });
  return { perTargetTotals, perTargetTypes, rolls, info };
}

// REMOVED: Duplicate functions quickDamageFromState and rollDamage - consolidated into rollDamageForTargets