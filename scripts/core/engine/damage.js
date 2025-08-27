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
    const parts = (item.system?.damage?.parts || []).map( ([f, t]) =>  normalizeDamagePart([f, t, true]) );

    // check if @mod is used (allowed only once in weapon) then normalizes the data
    
    const usesAtMod = parts.some(f => /@mod\b/.test(f));
    const cleanedParts = usesAtMod ? parts.map(([f, t, i]) => [removeAtMod(f), t, i]) : parts;
    
    return { parts: cleanedParts, usesAtMod };
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
function applyMinByFaces(damageParts) {
  return damageParts.map(([formula, type, inCrit]) => {
    const modifiedFormula = String(formula).replace(DIE_RE, (_, n, f, min) => {
      const faces = Number(f);
      const wanted = MIN_BY_FACES[faces];
      if (!wanted) return `${n}d${f}${min ? `min${min}` : ""}`;
      const eff = Math.max(Number(min ?? 0), wanted);
      return `${n}d${f}min${eff}`;
    });
    return [modifiedFormula, type, inCrit];
  });
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
 * Applies advantage or disadvantage to damage formulas.
 * NOTE: This function intentionally only modifies damage parts where 'inCrit' is true.
 * In this system, the 'inCrit' flag signifies that a damage part consists of rollable dice
 * and is eligible for all forms of modification (criticals, advantage, rerolls, etc.).
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
        const modifiedFormula = (inCrit == true) ? `${func}(${formula}, ${formula})` : formula; // Otherwise, leave the formula unchanged.   
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
    const finalType = type ?? undefined;
       
    const roll = await new Roll(finalFormula).evaluate({async:true});
    
    // Type has to go here for DSN animation and for damage calculation
    roll.terms
        .filter(term => term instanceof Die || term instanceof NumericTerm)
        .forEach(term => { term.options.flavor = finalType });
    
    //This is for rolls with complex formulas like max(). 
    // Type has to go here for DSN animation
    if(roll.dice.length > 0){
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
 * @returns {Promise<{rollArray: Array}>}
 */
async function buildRollArrays(damageParts) {
    let rollArray = [];

    for (const [formula, type, inCrit] of damageParts) {
        const roll = await createRoll(formula, type);
        if (roll) { rollArray.push(roll); }
    }
  return rollArray;
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

        rolls.forEach((roll) => {
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
        });
        return { total, byType };
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

/**
 * Processes damage parts into separate pools for base and extra critical damage.
 * @param {Array<[string, string, boolean]>} damageParts - The input array of damage parts.
 * @param {boolean} hasCrit - Whether a critical hit occurred (for adding brutal dice).
 * @param {string} brutalFormula - The brutal dice formula (e.g., "1d8").
 * @param {string} brutalType - The damage type for brutal dice.
 * @returns {DamagePools} An object containing the base and crit damage pools.
 */
function buildDamagePools(damageParts, hasCrit, brutalFormula, brutalType) {
    const basePool = [];
    const critPool = [];

    // 1. One pass to process all parts.
    for (const [formula, type, inCrit] of damageParts) {
        const terms = formula.split('+').map(term => term.trim());

    for (const term of terms) {
        if (term === "") continue; // Skip empty terms from bad formulas like "1d8 + ".

        // All terms go into the base damage pool.
        basePool.push([term, type, inCrit]);

        // Only dice terms from eligible parts go into the EXTRA crit pool.
        // `isNaN(term)` is true for "1d8", "max(1d6,1d6)", etc. It's false for "5".
        if ( inCrit  && isNaN(term) ) {
            critPool.push([term, type, inCrit]);
        }
    }
    }

    // 2. Add brutal dice to the crit pool if a crit occurred.
    if (hasCrit && brutalFormula) {
        critPool.push([brutalFormula, brutalType, true]);
    }

    // 3. Return the final, separated pools.
    return { basePool, critPool };
}

/* ----------------------------- MAIN ENGINE ----------------------------- */

export async function rollDamageForTargets({ actor, item, dmgState, targetRefs = [], critMap = {} }, separate = false) {

    /**
     * Determines the correct ability key based on a priority list.
     * Priority: User Override > Item Setting > Derived Default
     * @param {object} dmgState - The dialog state.
     *- The dmgState.ability is the user override from the dialog
    * @param {object} item - The weapon item.
    * @param {object} actor - The actor.
    * @returns {string} The final ability key ('str', 'dex', etc.).
    */
    function _getAbilityKey(dmgState, item, actor) {
        // 1. Highest priority: The user's override from the dialog.
        if (dmgState.ability) { return dmgState.ability; }

        // 2. Second priority: The item's specific setting.
        // If it's anything other than 'default' (e.g., 'str', 'con', 'none'), use it.
        const itemAbility = item?.system?.ability;
        if (itemAbility && itemAbility !== 'default') { return itemAbility; }

        // 3. Lowest priority: The item is set to 'default' or has no setting, so derive it.
        return deriveDefaultAbility(item, actor);
    }


    // 1. Gather all damage parts into a structured array.
    const { parts: baseWeaponParts, usesAtMod } = weaponParts(item);
    let damageParts = [...baseWeaponParts];
    
    // Get weapon's primary damage type, default kinetic
    const primaryType = damageParts[0]?.[1] || "kinetic";
    
    // 2. Add ability modifier
    if (usesAtMod) {
      const abilityKey = _getAbilityKey(dmgState, item, actor);
      
      let abilityMod = dmgState.smart ? Number(dmgState.smartAbility ?? 0)
                                      : Number(foundry.utils.getProperty(actor, `system.abilities.${abilityKey}.mod`) ?? 0);
      if (dmgState.offhand && abilityMod > 0) abilityMod = 0;
      
      if (abilityMod !== 0) {
        // Add the ability mod with the weapon's primary damage type.
        damageParts.push([signed(abilityMod), primaryType]);
      }
    }

    // 3. Add extra rows from the dialog.
    const extras = ( Array.isArray(dmgState.extraRows) ? dmgState.extraRows : []);
    for (const row of extras) {
        if (!row?.formula) continue;
        damageParts.push(normalizeDamagePart(row)); // [formula, type, inCrit]
    }

    // 4. Go through and do any formula edits that require     
      
    //PLACE HOLDER: For any pack files that may need to do formula edits before min die threshold, like armor resient's reroll max die roll. 

    // Apply min faces if the flag is set.
    if (dmgState.useMinDie) {
        damageParts = applyMinByFaces(damageParts);
    }
    
    // Give damage adv or disadv this may be changed later to accomadate pack that will handle this. 
    if(dmgState.otpDamageAdv || dmgState.otpDamageDis){
        const useAdvantage = !!dmgState.otpDamageAdv;
        damageParts = applyDamageAdvantage(damageParts, useAdvantage);
    };

    const hasCrits = Object.values(critMap).some(status => status === true);
    const { basePool, critPool } = buildDamagePools(damageParts, hasCrits, dmgState.brutalXdY, dmgState.brutalDamType);

    // 5. roll for group or individually for each target.
    const outputDamage = [];
    
    if (separate) {
        // --- INDIVIDUAL ROLLS ---
        // The loop belongs here, because the action is per-target.
        for (const ref of targetRefs) {
            const isCrit = !!critMap[ref];
            
            // Build the roll arrays FOR THIS TARGET.
            const { RollArray } = await buildRollArrays( basePool );
            const { CritRollArray } = await buildRollArrays( critPool );
            // Call the calculator FOR THIS TARGET.
            outputDamage.push(damageCalc(RollArray, CritRollArray, isCrit, ref));
            
            //"Roll the dice" on the screen
            for( const roller of RollArray) { game.dice3d.showForRoll(roller) };
            for( const roller of CritRollArray) { game.dice3d.showForRoll(roller) };
        }
    } else {
        // --- GROUP ROLL ---
        // No loop here. The action is once for the whole group.
         
        // Build the roll arrays ONCE.
        const RollArray = await buildRollArrays( basePool );
        const CritRollArray = await buildRollArrays( critPool );
        
        // Call the calculator ONCE.
        outputDamage.push(damageCalc(RollArray, CritRollArray, hasCrits, ""));
        //"Roll the dice" on the screen
        for( const roller of RollArray) { game.dice3d.showForRoll(roller) };
        for( const roller of CritRollArray) { game.dice3d.showForRoll(roller) };
    }
        
    
    return outputDamage


};


