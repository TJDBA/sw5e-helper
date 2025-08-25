// scripts/core/engine/damage.js
import { getWeaponById } from "../adapter/sw5e.js";

const signed = n => `${n >= 0 ? "+" : ""}${n}`;

// Feature flip: allow ability mod to damage on off-hand attacks
let ALLOW_OFFHAND_DAMAGE_MOD = false;

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

// Build weapon damage formulas (array of strings) and whether they use @mod (needed for ability override)
function weaponParts(item) {
  //Make sure the parts array is a string. 
  const parts = (item.system?.damage?.parts || []).map(
    ([formula, type]) => [
      String(formula ?? "0"),
      String(type ?? "kinetic")
    ]
  );
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
    sonic: "#420322ff",      // maroon
    true: "#FFFFFF"        // white
  };
  return colorMap[damageType?.toLowerCase()] || "#FFFFFF";
}

/* ----------------------------- MAIN ENGINE ----------------------------- */

//new version with simplified workflow, adds back in damage types and returns an array.
export async function rollDamageForTargets({ actor, item, dmgState, targetRefs = [], critMap = {} }) {
  console.log("SW5E DEBUG: rollDamageForTargets ENTRY", { weaponName: item?.name, dmgState, targetRefs, critMap });

  const brutalVal = getBrutal(item);

  // --- NEW: Centralized Formula Builder ---
  const makeFormula = (isCrit) => {
    // 1. Gather all damage parts into a structured array.
    let damageParts = weaponParts(item); // e.g., [['1d10', 'energy']]

    // 2. Add ability modifier (if not already handled by @mod).
    const usesAtMod = damageParts.some(([f]) => /@mod\b/.test(f));
    if (!usesAtMod) {
      const abilityKey = dmgState.ability || item?.system?.ability || deriveDefaultAbility(item);
      let abilityMod = dmgState.smart ? Number(dmgState.smartAbility ?? 0)
                                      : Number(foundry.utils.getProperty(actor, `system.abilities.${abilityKey}.mod`) ?? 0);
      if (dmgState.offhand && abilityMod > 0) abilityMod = 0;
      
      if (abilityMod !== 0) {
        // Add the ability mod with the weapon's primary damage type.
        const primaryType = damageParts[0]?.[1] || "kinetic";
        damageParts.push([signed(abilityMod), primaryType]);
      }
    }

    // 3. Add extra rows from the dialog.
    const extras = Array.isArray(dmgState.extraRows) ? dmgState.extraRows : [];
    for (const row of extras) {
      if (!row?.formula) continue;
      damageParts.push([row.formula, row.type || "kinetic", row.inCrit]); // [formula, type, inCrit]
    }

    // 4. Process all parts into a final formula string.
    let formulaString = damageParts.map(([formula, type, inCrit]) => {
      let part = formula;
      // Handle crits by doubling dice.
      if (isCrit) {
        // Double dice for base weapon parts and extras marked 'inCrit'.
        const isBasePart = inCrit === undefined;
        if (isBasePart || inCrit) {
          part = doubleDice(part);
        }
      }
      
      // --- FIX #2: Best place to apply minimums ---
      // Apply min faces if the flag is set.
      if (dmgState.useMinDie) {
        part = applyMinByFaces(part);
      }
      
      // --- FIX #1: Best place to add damage type ---
      // Wrap the final part in parentheses if needed and add the type.
      return part.includes("+") || part.includes("-") ? `(${part})[${type}]` : `${part}[${type}]`;

    }).join(" + ");

    // 5. Add brutal dice on a crit.
    if (isCrit && brutalVal > 0) {
      const faces = firstDieFaces(damageParts[0]?.[0]);
      if (faces) {
        const primaryType = damageParts[0]?.[1] || "kinetic";
        formulaString += ` + ${brutalVal}d${faces}[${primaryType}]`;
      }
    }
    
    return formulaString || "0";
  };

  // --- SIMPLIFIED ROLLING LOGIC ---
  
  // This function now just handles the Roll object and DSN.
  const doRoll = async (formula, rollContext = "") => {
    const data = { mod: Number(dmgState.smartAbility ?? 0) }; // For @mod
    const roll = await new Roll(formula, data).evaluate({ async: true });
    
    try {
      await game.dice3d?.showForRoll?.(roll, game.user, true); 
    } catch (_) {}
    
    // You'll need a new helper to sum damage by type from the roll terms.
    // This is more accurate than assuming one primary type.
    const types = _sumDamageByType(roll);
    
    console.log(`SW5E DEBUG: Roll result ${rollContext}`, { total: roll.total, formula: roll.formula, types });
    return { roll, types };
  };

  // Main logic...
  const rolls = [];
  const perTargetTotals = new Map();
  const perTargetTypes = new Map();

  // Always make a single base roll.
  const baseFormula = makeFormula(false);
  const { roll: baseRoll, types: baseTypes } = await doRoll(baseFormula, "- base roll");
  rolls.push(baseRoll);

  // If there are no crits, we're done.
  const hasCrits = targetRefs.some(ref => !!critMap[ref]);
  if (!hasCrits) {
    for (const ref of targetRefs) {
      perTargetTotals.set(ref, baseRoll.total);
      perTargetTypes.set(ref, baseTypes);
    }
    const info = `${baseFormula} = ${baseRoll.total}`;
    return { perTargetTotals, perTargetTypes, rolls, info, singleTotal: baseRoll.total };
  }

  // If there are crits, calculate and roll the extra crit damage.
  const critFormula = makeFormula(true);
  const { roll: critRoll, types: critTypes } = await doRoll(critFormula, "- full crit roll");
  rolls.push(critRoll);

  // Distribute totals
  for (const ref of targetRefs) {
    if (critMap[ref]) {
      perTargetTotals.set(ref, critRoll.total);
      perTargetTypes.set(ref, critTypes);
    } else {
      perTargetTotals.set(ref, baseRoll.total);
      perTargetTypes.set(ref, baseTypes);
    }
  }

  const info = `Base: ${baseFormula} = ${baseRoll.total} | Crit: ${critFormula} = ${critRoll.total}`;
  return { perTargetTotals, perTargetTypes, rolls, info };
}

// You will need this new helper function to parse the roll results accurately.
function _sumDamageByType(roll) {
    const damageMap = {};
    for (const term of roll.terms) {
        // We only care about Dice and Numeric terms with a flavor (damage type)
        if ((term instanceof Dice || term instanceof NumericTerm) && term.flavor) {
            const type = term.flavor;
            const total = term instanceof Dice ? term.total : term.number;
            damageMap[type] = (damageMap[type] || 0) + total;
        }
    }
    return damageMap;
}



/*  Replaced with new version with simplified workflow, adds back in damage types and returns an array. 
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
} */

  