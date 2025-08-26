/*

refactoring damage.js to allow for damage type dice color and to setup return file to 
Will be building it around now core test script sturcture found in https://github.com/TJDBA/sw5e-helper/issues/7
*/

const signed = n => `${n >= 0 ? "+" : ""}${n}`;
const DIE_RE = /(\d+)d(\d+)(?:\s*min\s*(\d+))?/gi; // NdF [minY]

// Feature flip: allow ability mod to damage on off-hand attacks
let ALLOW_OFFHAND_DAMAGE_MOD = false;

/* ----------------------------- helpers ----------------------------- */
//returns str by default unless weapon is ranged or it has finesse and dex is greater then str
function deriveDefaultAbility(item, actor) {
  const sys = item.system ?? {};
  if (sys.ability) return sys.ability;
  const type = sys.actionType || sys.activation?.type;
  const ranged = type?.startsWith?.("r");
  const finesse = sys.properties?.fin || sys.properties?.finesse;
  const dexVal = Number(foundry.utils.getProperty(actor,'system.abilities.dex.mod'));
  const strVal = Number(foundry.utils.getProperty(actor,'system.abilities.str.mod'));
  return (ranged || (finesse && (dexVal > strVal))) ? "dex" : "str";
}

// Build weapon damage formulas (array of strings) and whether they use @mod (needed for ability override)
function weaponParts(item) {
    
    //Make sure the parts array is a string. 
    const parts = (item.system?.damage?.parts || []).map(
        ([formula, type ]) => [
        String(formula ?? "0"),
        String(type ?? "kinetic")
        ]
    );

    // check if @mod is used (allowed only once in weapon) then normalizes the data
    let tempParts = [];
    const usesAtMod = parts.some(f => /@mod\b/.test(f));
    for(const part of parts){
        tempParts.push( normalizeDamagePart(removeAtMod(part.formula),part.type, true) );
    };
    
    return { tempParts, usesAtMod };
}

/**
 * Removes the @mod term from a formula string.
 * @param {string} formula - The formula, e.g., "1d8 + @mod + 5".
 * @returns {string} The formula without the @mod term, e.g., "1d8 + 5".
 */
function removeAtMod(formula) {
  return formula
    .split('+') // 1. Split into parts: ["1d8 ", " @mod ", " 5"]
    .map(p => p.trim()) // 2. Trim whitespace: ["1d8", "@mod", "5"]
    .filter(p => p !== '@mod') // 3. Remove the @mod term: ["1d8", "5"]
    .join('+'); // 4. Join back together: "1d8 + 5"
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

//Possible redundent as this is calculated and passed in from dmgState from Damage Dialog. 
// Find first NdF in a formula to determine faces for Brutal
function firstDieFaces(formula) {
  const m = [...String(formula || "").matchAll(DIE_RE)][0];
  return m ? Number(m[2]) : null;
}

function normalizeDamagePart(part) {
  // 1. Handle completely invalid input first.
  if (part === null || part === undefined) {
    return ["0", "", false];
  }
  // 2. Normalize the input shape to always be an array.
  // If `part` is a string, this becomes `[part]`. If it's an array, it stays an array.
  const partAsArray = Array.isArray(part) ? part : [part];
  // 3. Destructure the array with defaults. This handles all cases.
  const [formula = "0", type = "", inCrit = false] = partAsArray;
  // 4. Return the fully structured and type-coerced array. This is robust.
  return [String(formula).replace(" ",""), String(type), !!inCrit];
}

/**
* Applies advantage or disadvantage to the dice portions of damage formulas.
* @param {Array<[string, ...any]>} damageParts - The array of damage parts.
* @param {boolean} useAdvantage - True for advantage (max), false for disadvantage (min).
* @returns {Array} The new array of damage parts with modified formulas.
**/
function applyDamageAdvantage(damagePart, useAdvantage) {
    //const DICE_REGEX = /(\d+d\d+)/gi;
    const func = useAdvantage ? 'max' : 'min';

    return damagePart.map(([formula, type, inCrit]) => {
    // Only modify the formula if the inCrit flag is explicitly true.
    const modifiedFormula = (inCrit == true)
        ? formula.replace(formula => `${func}(${formula}, ${formula})`)
        : formula; // Otherwise, leave the formula unchanged.

    // Return the full part with the potentially modified formula.
    return [modifiedFormula, type, inCrit];
    });
}

/**
 * Creates and evaluates a Roll, handling empty inputs and flavoring terms/dice.
 * @param {string|null} rollFormula - The formula. If null, the function returns null.
 * @param {string|null} type - The damage type. Defaults to "" if null.
 * @returns {Promise<Roll|null>} The evaluated Roll object, or null if the formula was null.
 */
async function createRoll(rollFormula, type) {
    // Handle the explicit null case. This is the only way to get a null return.
    if (rollFormula === null) {
        return null;
    }

    // Sanitize the inputs.
    // If the formula is an empty string or "0", treat it as "0". Otherwise, use it as-is.
    const finalFormula = String(rollFormula).trim() || "0";
    // If the type is null or undefined, default it to an empty string.
    const finalType = type ?? "";
       
    const roll = await new Roll(finalFormula).evaluate({async:true});
    
    // Type has to go here for DSN animation and for damage calculation
    roll.terms
        .filter(term => term instanceof Die || term instanceof NumericTerm)
        .forEach(term => { term.options.flavor = finalType });
    
    //This is for rolls with complex formulas like max(). 
    // Type has to go here for DSN animation
    if(!(roll.dice.length > 0)){
        roll.dice.forEach(die => {
            die.options.flavor = finalType;
        });
    }
    return roll;
}

/**
 * Builds the base and critical roll arrays from a list of damage parts.
 * @param {Array} damageParts - The processed list of damage parts.
 *- `isCrit` flag is for brutal die
 * @returns {Promise<{rollArray: Array, critRollArray: Array}>}
 */
async function buildRollArrays(damageParts, isCrit) {
    let rollArray = [];
    let critRollArray = [];

    for (const [formula, type, inCrit] of damageParts) {
    const roll = await createRoll(formula, type);
    if (roll) {
        rollArray.push(roll);
        // Crit roll includes base weapon dice (inCrit set to true in ) and extras (inCrit=true)
        if (inCrit === true) {
            const critRoll = await createRoll(formula, type);
            critRollArray.push(critRoll);
        }
    }
    }
    // Add brutal dice if a crit occurred.
    if (isCrit) {
        critRollArray.push(await createRoll(dmgState.brutalXdY, dmgState.brutalDamType));
    }

  return { rollArray, critRollArray };
}

/**
 * Sums evaluated rolls, calculates totals, and aggregates damage by type.
 * @param {Roll[]} rollArray - The evaluated Roll objects for base damage.
 * @param {Roll[]} critRollArray - The evaluated Roll objects for EXTRA critical damage.
 * @param {boolean} isCrit - True if this damage instance is a critical hit.
 * @param {string} ref - The reference ID to link back to the target.
 * @returns {{
 *   TotalDam: number,
 *   TotalCritDam: number,
 *   TotalDamByType: object,
 *   TotalCritDamByType: object,
 *   RollArray: Roll[],
 *   CritRollArray: Roll[],
 *   TargetRef: string
 * }}
 */
function damageCalc(rollArray, critRollArray, isCrit, ref) {

/**
 * Helper to sum a list of Roll objects.
 * @param {Roll[]} rolls - The array of rolls to sum.
 * @returns {{total: number, byType: object}}
 */
    // --- This is the correct helper to put inside your damageCalc function ---

  /**
   * Helper to sum a list of Roll objects based on the term structure.
   * @param {Roll[]} rolls - The array of rolls to sum.
   * @returns {{total: number, byType: object}}
   */
    const _sumRolls = (rolls) => {
        let total = 0;
        const byType = {};

        for (const roll of rolls) {
            if (!roll) continue;
            total += roll.total;

            for (const term of roll.terms) {
            const type = term.options.flavor;
            if (!type) continue; // Skip terms without a damage type.

            byType[type] = byType[type] || 0;

            if (term instanceof Die) {
                // It correctly sums the individual results within a Die term.
                const dieTotal = term.results.reduce((sum, result) => sum + result.result, 0);
                byType[type] += dieTotal;
            } else if (term instanceof NumericTerm) {
                // It correctly adds the value of static numbers.
                byType[type] += term.number;
            }
            }
        }
        return { total, byType };
    };

    /**
     * Helper to merge two damage-by-type objects.
     * @param {object} base - The base damage map.
     * @param {object} extra - The extra damage map.
     * @returns {object}
     */
    const _mergeTypes = (base, extra) => {
    const merged = { ...base };
    for (const type in extra) {
        merged[type] = (merged[type] || 0) + extra[type];
    }
        return merged;
    };

    // 1. Calculate the totals for the base and crit parts separately.
    const baseDamage = _sumRolls(rollArray);
    const critDamage = isCrit ? _sumRolls(critRollArray) : { total: 0, byType: {} };


    // 2. Return the complete, structured object.
    return {
        // The base damage total. This is what a normal hit does.
        TotalDam: baseDamage.total,
        // The EXTRA damage from the crit.
        TotalCritDam: critDamage.total,
        // The damage-by-type for the base roll.
        TotalDamByType: baseDamage.byType,
        // The damage-by-type for ONLY THE EXTRA crit parts.
        TotalCritDamByType: critDamage.byType,
        RollArray: rollArray,
        CritRollArray: critRollArray,
        TargetRef: ref
    };
}

/* ----------------------------- MAIN ENGINE ----------------------------- */

export async function rollDamageForTargets({ actor, item, dmgState, targetRefs = [], critMap = {} }, separate = false) {

    // 1. Gather all damage parts into a structured array.
    let damageParts = weaponParts(item); // e.g., [['1d10', 'energy']]
    
    // Get weapon's primary damage type, default kinetic
    const primaryType = damageParts[0]?.[1] || "kinetic";
    
    // 2. Add ability modifier (if not already handled by @mod).
    if (!damageParts.usesAtMod) {
      const abilityKey = dmgState.ability || item?.system?.ability || deriveDefaultAbility(item);
      let abilityMod = dmgState.smart ? Number(dmgState.smartAbility ?? 0)
                                      : Number(foundry.utils.getProperty(actor, `system.abilities.${abilityKey}.mod`) ?? 0);
      if (dmgState.offhand && abilityMod > 0) abilityMod = 0;
      
      if (abilityMod !== 0) {
        // Add the ability mod with the weapon's primary damage type.
        damageParts.push([signed(abilityMod), primaryType]);
      }
    }

    // 3. Add extra rows from the dialog.
    const extras = Array.isArray(dmgState.extraRows) ? dmgState.extraRows : [];
    for (const row of extras) {
      if (!row?.formula) continue;
      damageParts.push([row.formula, row.type || "kinetic", row.inCrit]); // [formula, type, inCrit]
    }

    // 4. Go through and do any formula edits that require     
      
    //PLACE HOLDER: For any pack files that may need to do formula edits before min die threshold, like armor resient's reroll max die roll. 

    // Apply min faces if the flag is set.
    if (dmgState.useMinDie) {
    damageParts = applyMinByFaces(damageParts);
    }

    // Give damage adv or disadv this may be changed later to accomadate pack that will handle this. 
    if(dmgState.otpDamageAdv || dmgState.otpDamageDis){
    const damAdv = otpDamageAdv ? otpDamageAdv : otpDamageDis;
    damageParts = applyDamageAdvantage(damageParts, damAdv);
    };


    // 5. roll for group or individually for each target.
    const outputDamage = [];
    
    if (separate) {
        // --- INDIVIDUAL ROLLS ---
        // The loop belongs here, because the action is per-target.
        for (const ref of targetRefs) {
            const isCrit = !!critMap[ref];
            
            // Build the roll arrays FOR THIS TARGET.
            const { rollArray, critRollArray } = await buildRollArrays(damageParts, isCrit);
            
            // Call the calculator FOR THIS TARGET.
            outputDamage.push(damageCalc(rollArray, critRollArray, isCrit, ref));
            
            //"Roll the dice" on the screen
            for( const roller of RollArray) { game.dice3d.showForRoll(roller) };
            for( const roller of CritRollArray) { game.dice3d.showForRoll(roller) };
        }
    } else {
        // --- GROUP ROLL ---
        // No loop here. The action is once for the whole group.
        const hasCrits = Object.values(critMap).some(status => status === true);
        
        // Build the roll arrays ONCE.
        const { rollArray, critRollArray } = await buildRollArrays(damageParts, hasCrits);
        
        // Call the calculator ONCE.
        outputDamage.push(damageCalc(rollArray, critRollArray, hasCrits, ""));
        //"Roll the dice" on the screen
        for( const roller of RollArray) { game.dice3d.showForRoll(roller) };
        for( const roller of CritRollArray) { game.dice3d.showForRoll(roller) };
    }
        
    
    return outputDamage


};


