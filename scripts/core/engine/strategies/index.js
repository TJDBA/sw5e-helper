// scripts/core/engine/strategies/index.js
// SW5E Helper - Roll Strategy Pattern System
// Simplifies damage engine with clean strategy separation

import { ConfigHelper } from "../../config.js";

/**
 * Base class for all roll strategies
 */
export class BaseRollStrategy {
  /**
   * Execute the rolling strategy
   * @param {Object} params - Roll parameters
   * @returns {Promise<Object>} Roll results
   */
  async execute(params) {
    throw new Error(`Strategy ${this.constructor.name} must implement execute() method`);
  }

  /**
   * Build damage formula from parts and state
   * @param {Object} parts - Weapon damage parts
   * @param {Object} state - Damage state
   * @param {boolean} isCrit - Is critical hit
   * @returns {string} Complete damage formula
   */
  buildFormula(parts, state, isCrit = false) {
    const { baseParts, usesAtMod } = parts;
    const { actor, abilityMod, extraRows = [] } = state;
    
    let formula = baseParts.join(" + ") || "0";
    
    // Apply crit doubling to base dice
    if (isCrit) {
      formula = this.doubleDice(formula);
    }
    
    // Add brutal dice if crit
    if (isCrit && state.brutalVal > 0 && state.baseFaces) {
      formula = `${formula} + ${state.brutalVal}d${state.baseFaces}`;
    }
    
    // Add ability modifier if weapon doesn't include @mod
    if (!usesAtMod && abilityMod !== 0) {
      const sign = abilityMod >= 0 ? "+" : "";
      formula = `${formula} ${sign} ${abilityMod}`;
    }
    
    // Add extra rows
    for (const row of extraRows) {
      if (!row.formula) continue;
      let rowFormula = row.formula;
      if (isCrit && row.inCrit) {
        rowFormula = this.doubleDice(rowFormula);
      }
      formula = `${formula} + (${rowFormula})`;
    }
    
    return formula;
  }

  /**
   * Double dice in a formula string
   * @param {string} formula - Original formula
   * @returns {string} Formula with doubled dice
   */
  doubleDice(formula) {
    return String(formula || "").replace(/(\d+)d(\d+)/gi, (_, n, f) => `${Number(n) * 2}d${f}`);
  }

  /**
   * Create and evaluate a roll
   * @param {string} formula - Roll formula
   * @param {Object} data - Roll data
   * @param {string} damageType - Primary damage type for DSN
   * @returns {Promise<Roll>} Evaluated roll
   */
  async createRoll(formula, data = {}, damageType = "kinetic") {
    const roll = new Roll(formula, data);
    await roll.evaluate({ async: true });
    
    // Apply DSN with damage type color
    try {
      const color = ConfigHelper.getDamageTypeColor(damageType);
      await game.dice3d?.showForRoll?.(roll, game.user, true, null, false, null, {
        colorset: color
      });
    } catch (_) {
      try {
        await game.dice3d?.showForRoll?.(roll, game.user, true);
      } catch (_) {}
    }
    
    return roll;
  }

  /**
   * Calculate damage type breakdown
   * @param {Array} extraRows - Extra damage rows
   * @param {number} total - Total damage
   * @returns {Object} Damage type map
   */
  calculateTypeBreakdown(extraRows, total) {
    // Simple implementation - could be enhanced for proportional breakdown
    const types = { kinetic: total };
    
    // If we have typed extra damage, adjust the breakdown
    for (const row of extraRows) {
      if (row.type && row.type !== "kinetic") {
        // This is simplified - a real implementation might parse the roll results
        types[row.type] = types[row.type] || 0;
      }
    }
    
    return types;
  }
}

/**
 * Strategy for shared rolls across all targets
 */
export class SharedRollStrategy extends BaseRollStrategy {
  async execute({ actor, item, dmgState, targetRefs, critMap }) {
    ConfigHelper.debug("damage", "SharedRollStrategy executing", { 
      targetRefs, 
      critMap 
    });

    const critRefs = targetRefs.filter(ref => critMap[ref]);
    const hitRefs = targetRefs.filter(ref => !critMap[ref]);
    const hasCrits = critRefs.length > 0;
    const hasHits = hitRefs.length > 0;
    const isMixed = hasCrits && hasHits;

    const rolls = [];
    const perTargetTotals = new Map();
    const perTargetTypes = new Map();

    if (!isMixed) {
      // Uniform case - all same type
      const baseRoll = await this.createRoll(
        this.buildFormula(dmgState.parts, dmgState, hasCrits),
        dmgState.rollData,
        dmgState.primaryDamageType
      );
      rolls.push(baseRoll);
      
      const total = baseRoll.total;
      const types = this.calculateTypeBreakdown(dmgState.extraRows, total);
      
      for (const ref of targetRefs) {
        perTargetTotals.set(ref, total);
        perTargetTypes.set(ref, types);
      }
      
      return {
        perTargetTotals,
        perTargetTypes,
        rolls,
        info: `${this.buildFormula(dmgState.parts, dmgState, hasCrits)} = ${total}`
      };
    }

    // Mixed case - base + crit extra
    const baseRoll = await this.createRoll(
      this.buildFormula(dmgState.parts, dmgState, false),
      dmgState.rollData,
      dmgState.primaryDamageType
    );
    rolls.push(baseRoll);
    
    const critExtraRoll = await this.createRoll(
      this.buildCritExtraFormula(dmgState),
      dmgState.rollData,
      dmgState.primaryDamageType
    );
    rolls.push(critExtraRoll);

    // Distribute results
    const baseTotal = baseRoll.total;
    const extraTotal = critExtraRoll.total;
    
    for (const ref of hitRefs) {
      perTargetTotals.set(ref, baseTotal);
      perTargetTypes.set(ref, this.calculateTypeBreakdown(dmgState.extraRows, baseTotal));
    }
    
    for (const ref of critRefs) {
      const total = baseTotal + extraTotal;
      perTargetTotals.set(ref, total);
      perTargetTypes.set(ref, this.calculateTypeBreakdown(dmgState.extraRows, total));
    }

    return {
      perTargetTotals,
      perTargetTypes,
      rolls,
      info: `Base: ${baseTotal} + Crit Extra: ${extraTotal}`
    };
  }

  /**
   * Build crit extra formula (dice only)
   * @param {Object} dmgState - Damage state
   * @returns {string} Crit extra formula
   */
  buildCritExtraFormula(dmgState) {
    let formula = this.extractDiceOnly(dmgState.parts.baseParts.join(" + "));
    
    // Add brutal dice
    if (dmgState.brutalVal > 0 && dmgState.baseFaces) {
      formula = formula ? `${formula} + ${dmgState.brutalVal}d${dmgState.baseFaces}` 
                        : `${dmgState.brutalVal}d${dmgState.baseFaces}`;
    }
    
    // Add crit-eligible extra rows (dice only)
    for (const row of dmgState.extraRows || []) {
      if (row.inCrit && row.formula) {
        const diceOnly = this.extractDiceOnly(row.formula);
        if (diceOnly) {
          formula = formula ? `${formula} + ${diceOnly}` : diceOnly;
        }
      }
    }
    
    return formula || "0";
  }

  /**
   * Extract only dice from a formula
   * @param {string} formula - Full formula
   * @returns {string} Dice-only formula
   */
  extractDiceOnly(formula) {
    const matches = String(formula).match(/(\d+d\d+)/gi);
    return matches ? matches.join(" + ") : "";
  }
}

/**
 * Strategy for separate rolls per target
 */
export class SeparateRollStrategy extends BaseRollStrategy {
  async execute({ actor, item, dmgState, targetRefs, critMap }) {
    ConfigHelper.debug("damage", "SeparateRollStrategy executing", { 
      targetRefs, 
      critMap 
    });

    const rolls = [];
    const perTargetTotals = new Map();
    const perTargetTypes = new Map();

    for (const ref of targetRefs) {
      const isCrit = critMap[ref];
      const formula = this.buildFormula(dmgState.parts, dmgState, isCrit);
      
      const roll = await this.createRoll(
        formula,
        dmgState.rollData,
        dmgState.primaryDamageType
      );
      rolls.push(roll);

      const total = roll.total;
      const types = this.calculateTypeBreakdown(dmgState.extraRows, total);
      
      perTargetTotals.set(ref, total);
      perTargetTypes.set(ref, types);
    }

    return {
      perTargetTotals,
      perTargetTypes,
      rolls,
      info: "Separate rolls per target"
    };
  }
}

/**
 * Factory for creating roll strategies
 */
export class RollStrategyFactory {
  /**
   * Create appropriate strategy for the context
   * @param {boolean} separate - Whether to roll separately
   * @returns {BaseRollStrategy} Strategy instance
   */
  static create(separate) {
    return separate ? new SeparateRollStrategy() : new SharedRollStrategy();
  }
}