// scripts/core/engine/apply-damage.js
// SW5E Helper - Damage Application System

const DEBUG = true;

/**
 * Universal function to retrieve sw5e helper flags
 * @param {Actor|Item} actorOrItem - Actor or Item object to search
 * @param {string[]} filters - Optional filters for flag types
 * @returns {Array} Array of flags found
 */
function getFlags(actorOrItem, filters = []) {
  if (DEBUG) console.log("SW5E DEBUG: getFlags() called", { actorOrItem: actorOrItem?.name, filters });
  
  const flags = [];
  
  // TODO: Search for flags on character where sw5e-helper and filters match
  // Placeholder implementation - return empty array for now
  
  if (DEBUG) console.log("SW5E DEBUG: getFlags() returning", { flags });
  return flags;
}

/**
 * Get target HP object, split out for future enhancements
 * @param {Actor} target - Target actor
 * @param {Array} optionMods - Optional modifiers (future use)
 * @returns {Object} HP object matching SW5E system structure
 */
function getHP(target, optionMods = []) {
  if (DEBUG) console.log("SW5E DEBUG: getHP() called", { target: target?.name, optionMods });
  
  const systemHP = target?.system?.attributes?.hp || {};
  
  const hp = {
    value: Number(systemHP.value ?? 0),
    max: Number(systemHP.max ?? 0),
    temp: Number(systemHP.temp ?? 0) || null, // Store as null if 0 or empty
    tempmax: Number(systemHP.tempmax ?? 0) || null,
    // Store originals for rollback capability
    originalValue: Number(systemHP.value ?? 0),
    originalTemp: Number(systemHP.temp ?? 0) || null
  };
  
  if (DEBUG) console.log("SW5E DEBUG: getHP() returning", { hp });
  return hp;
}

/**
 * Calculate damage to apply after reducing based on resistances
 * @param {Array|Map|Object} damage - Damage array/map in format from card system
 * @param {Array} modFlags - Modification flags for resistances/immunities
 * @returns {Array} Array of damage objects with original and final amounts
 */
function calcDamage(damage, modFlags = []) {
  if (DEBUG) console.log("SW5E DEBUG: calcDamage() called", { damage, modFlags });
  
  const damToReturn = [];
  
  // Handle different damage input formats
  let damageEntries = [];
  if (Array.isArray(damage)) {
    damageEntries = damage;
  } else if (damage instanceof Map) {
    damageEntries = Array.from(damage.entries()).map(([type, amount]) => ({ type, amount }));
  } else if (typeof damage === 'object') {
    damageEntries = Object.entries(damage).map(([type, amount]) => ({ type, amount }));
  }
  
  for (const damageEntry of damageEntries) {
    const damageType = damageEntry.type || damageEntry[0] || "kinetic";
    const originalAmount = Number(damageEntry.amount || damageEntry[1] || damageEntry || 0);
    
    let finalAmount = originalAmount;
    
    // TODO: Apply resistances/immunities/vulnerabilities in specific order
    // Placeholder: if modFlags not empty, cycle through flags and reduce damage appropriately
    if (modFlags && modFlags.length > 0) {
      // Future implementation will process flags in order:
      // 1. Immunities (set damage to 0)
      // 2. Resistances (halve damage, minimum 1)  
      // 3. Vulnerabilities (double damage)
      if (DEBUG) console.log("SW5E DEBUG: Would apply mod flags", { modFlags, damageType, originalAmount });
    }
    
    damToReturn.push({
      damageType,
      damOriginal: originalAmount,
      damageFinal: finalAmount
    });
  }
  
  if (DEBUG) console.log("SW5E DEBUG: calcDamage() returning", { damToReturn });
  return damToReturn;
}

/**
 * Apply the damage to the target's HP
 * @param {Actor} target - Target actor
 * @param {Object} hp - HP object from getHP()
 * @param {Array} damage - Processed damage array from calcDamage()
 * @returns {Object} Updated HP object with damage applied
 */
function applyDam(target, hp, damage) {
  if (DEBUG) console.log("SW5E DEBUG: applyDam() called", { target: target?.name, hp, damage });
  
  // Calculate total damage to apply
  const totalDamage = damage.reduce((sum, d) => sum + d.damageFinal, 0);
  hp.toApply = totalDamage;
  
  let remainingDamage = totalDamage;
  let newTemp = hp.temp;
  let newValue = hp.value;
  
  // Apply damage to temp HP first if it exists and is > 0
  if (newTemp && newTemp > 0 && remainingDamage > 0) {
    if (DEBUG) console.log("SW5E DEBUG: Applying damage to temp HP first", { newTemp, remainingDamage });
    
    if (remainingDamage >= newTemp) {
      // Damage exceeds temp HP - remove all temp HP and continue with remainder
      remainingDamage -= newTemp;
      newTemp = 0;
    } else {
      // Damage doesn't exceed temp HP - reduce temp HP and we're done
      newTemp -= remainingDamage;
      remainingDamage = 0;
    }
  }
  
  // Apply remaining damage to regular HP
  if (remainingDamage > 0) {
    newValue -= remainingDamage;
    if (newValue < 0) newValue = 0;
  }
  
  // Update HP object
  hp.temp = newTemp || null; // Convert 0 back to null
  hp.value = newValue;
  hp.newHP = newValue; // Legacy field name from pseudo code
  
  if (DEBUG) console.log("SW5E DEBUG: applyDam() returning", { hp });
  return hp;
}

/**
 * Controller function to apply damage - main entry point
 * @param {Actor} target - Target actor
 * @param {Array|Map|Object} damage - Damage to apply (various formats supported)
 * @param {string} damageMode - Damage application mode: "none", "half", "full" (default: "full")
 * @returns {Object} Summary of damage application
 */
export async function applyDamage(target, damage, damageMode = "full") {
  if (DEBUG) console.log("SW5E DEBUG: applyDamage() controller called", { target: target?.name, damage, damageMode });
  
  try {
    // Step 1: Handle damage mode modifiers first
    const mode = (damageMode || "full").toLowerCase();
    
    // Handle "none" mode - no damage applied
    if (mode === "none") {
      const hp = getHP(target);
      const processedDamage = calcDamage(damage, []); // Still process for display purposes
      
      const summary = {
        target: target.name,
        totalDamageApplied: 0,
        damageMode: "none",
        damageBreakdown: processedDamage.map(d => ({...d, damageFinal: 0})), // Show original but final is 0
        hp: {
          before: {
            value: hp.originalValue,
            temp: hp.originalTemp
          },
          after: {
            value: hp.originalValue, // No change
            temp: hp.originalTemp    // No change
          },
          rollback: {
            value: hp.originalValue,
            temp: hp.originalTemp
          }
        },
        resistancesApplied: ["No Damage (Mode: None)"],
        success: "none-taken"
      };
      
      if (DEBUG) console.log("SW5E DEBUG: No damage mode - returning without applying", { summary });
      return summary;
    }
    
    // Step 2: Get current HP
    const hp = getHP(target);
    
    // Step 3: Apply half damage modifier if needed
    let modifiedDamage = damage;
    if (mode === "half") {
      if (DEBUG) console.log("SW5E DEBUG: Applying half damage modifier");
      
      // Convert damage to array format for processing
      let damageEntries = [];
      if (Array.isArray(damage)) {
        damageEntries = damage;
      } else if (damage instanceof Map) {
        damageEntries = Array.from(damage.entries()).map(([type, amount]) => ({ type, amount }));
      } else if (typeof damage === 'object') {
        damageEntries = Object.entries(damage).map(([type, amount]) => ({ type, amount }));
      }
      
      // Halve each damage amount (round up)
      modifiedDamage = damageEntries.map(entry => {
        const damageType = entry.type || entry[0] || "kinetic";
        const originalAmount = Number(entry.amount || entry[1] || entry || 0);
        const halvedAmount = Math.ceil(originalAmount / 2); // Round up
        
        return { type: damageType, amount: halvedAmount };
      });
      
      if (DEBUG) console.log("SW5E DEBUG: Damage halved", { original: damageEntries, halved: modifiedDamage });
    }
    
    // Step 4: Get resistance/immunity flags
    const flags = getFlags(target);
    
    // Step 5: Calculate final damage after resistances
    const processedDamage = calcDamage(modifiedDamage, flags);
    
    // Step 6: Apply damage to HP
    const updatedHP = applyDam(target, hp, processedDamage);
    
    // Step 7: Update actor with new HP values
    const updateData = {
      "system.attributes.hp.value": updatedHP.value
    };
    
    // Only update temp if it changed or was cleared
    if (updatedHP.temp !== updatedHP.originalTemp) {
      updateData["system.attributes.hp.temp"] = updatedHP.temp || 0;
    }
    
    await target.update(updateData);
    
    // Step 8: Build return summary
    const resistancesApplied = [];
    if (mode === "half") {
      resistancesApplied.push("Half Damage (Mode: Half)");
    }
    // TODO: Add actual resistance flags when implemented
    
    const summary = {
      target: target.name,
      totalDamageApplied: updatedHP.toApply,
      damageMode: mode,
      damageBreakdown: processedDamage,
      hp: {
        before: {
          value: updatedHP.originalValue,
          temp: updatedHP.originalTemp
        },
        after: {
          value: updatedHP.value,
          temp: updatedHP.temp
        },
        // Rollback data
        rollback: {
          value: updatedHP.originalValue,
          temp: updatedHP.originalTemp
        }
      },
      resistancesApplied,
      success: true
    };
    
    if (DEBUG) console.log("SW5E DEBUG: applyDamage() controller returning", { summary });
    return summary;
    
  } catch (error) {
    console.error("SW5E Helper: Error applying damage", error);
    return {
      target: target?.name || "Unknown",
      success: false,
      error: error.message,
      damageMode: damageMode,
      totalDamageApplied: 0,
      damageBreakdown: [],
      hp: { before: {}, after: {} }
    };
  }
}

/**
 * Rollback damage application (utility function)
 * @param {Actor} target - Target actor
 * @param {Object} damageResult - Complete result from applyDamage() containing rollback data and damage applied
 * @returns {boolean} Success/failure
 */
export async function rollbackDamage(target, damageResult) {
  if (DEBUG) console.log("SW5E DEBUG: rollbackDamage() called", { target: target?.name, damageResult });
  
  try {
    const rollbackData = damageResult.hp.rollback;
    const totalDamageDealt = damageResult.totalDamageApplied;
    const originalTemp = rollbackData.temp || 0;
    
    // Calculate how much damage was applied to temp vs regular HP
    let tempDamage = 0;
    let regularHPDamage = 0;
    
    if (originalTemp > 0) {
      if (totalDamageDealt >= originalTemp) {
        // All temp HP was removed, remainder went to regular HP
        tempDamage = originalTemp;
        regularHPDamage = totalDamageDealt - originalTemp;
      } else {
        // Only temp HP was affected
        tempDamage = totalDamageDealt;
        regularHPDamage = 0;
      }
    } else {
      // No temp HP, all damage went to regular HP
      regularHPDamage = totalDamageDealt;
    }
    
    // Restore values: temp to original, HP + damage that went to regular HP
    const updateData = {
      "system.attributes.hp.value": rollbackData.value, // Original HP value
      "system.attributes.hp.temp": rollbackData.temp || 0 // Original temp HP
    };
    
    await target.update(updateData);
    
    if (DEBUG) console.log("SW5E DEBUG: Damage rollback successful", { 
      restoredHP: rollbackData.value,
      restoredTemp: rollbackData.temp,
      tempDamageReversed: tempDamage,
      regularHPDamageReversed: regularHPDamage
    });
    
    return true;
  } catch (error) {
    console.error("SW5E Helper: Error rolling back damage", error);
    return false;
  }
}