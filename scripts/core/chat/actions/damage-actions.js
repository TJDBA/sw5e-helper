// scripts/core/chat/actions/damage-actions.js
// SW5E Helper - Damage Action Handlers
// Handles damage rolling actions (quick, modified)

import { BaseCardAction } from "./BaseCardAction.js";
import { ConfigHelper } from "../../config.js";
import { rollDamageForTargets } from "../../engine/damage.js";
import { openDamageDialog } from "../../../ui/DamageDialog.js";
import { PackRegistry } from "../../../packs/pack-registry.js";

/**
 * Quick damage roll without dialog (uses base weapon damage)
 */
export class QuickDamageAction extends BaseCardAction {
  async execute(message, state, context) {
    const eligibleTargets = this.getEligibleTargets(state);
    
    const actor = this.getActor(state);
    const weapon = this.getWeapon(state);
    
    if (!actor || !weapon) {
      ui.notifications.error("Cannot resolve actor or weapon for damage roll");
      return;
    }

    // Build damage data with pack modifications
    let damageData = state.options || {};
    if (state.packState) {
      damageData = PackRegistry.modifyDamage(damageData, state.packState, actor, weapon);
    }

    const targetRefs = eligibleTargets.map(t => `${t.sceneId}:${t.tokenId}`);
    const critMap = Object.fromEntries(eligibleTargets.map(t => [
      `${t.sceneId}:${t.tokenId}`,
      String(t?.summary?.status) === "crit"
    ]));

    ConfigHelper.debug("damage", "Quick damage roll", {
      targets: targetRefs,
      critMap,
      damageData,
      separate: !!state.options?.separate
    });

    const { perTargetTotals, perTargetTypes, rolls, info } = await rollDamageForTargets({
      actor, 
      item: weapon,
      dmgState: damageData,
      targetRefs, 
      critMap,
      separate: !!state.options?.separate
    });

    // Update targets with damage results
    for (const target of eligibleTargets) {
      const ref = `${target.sceneId}:${target.tokenId}`;
      const total = perTargetTotals.get(ref);
      
      if (total != null) {
        target.damage = { 
          total, 
          types: perTargetTypes.get(ref) || { kinetic: total }, 
          info 
        };
      }
    }

    // Consume pack resources after successful roll
    if (state.packState) {
      try {
        await PackRegistry.consumeResources(state.packState, actor, weapon);
      } catch (error) {
        console.error("SW5E Helper: Error consuming pack resources", error);
      }
    }

    if (rolls?.length) await this.appendRolls(message, rolls);
    await this.updateMessage(message, state);
  }

  validate(message, state, context) {
    const errors = [];
    const eligibleTargets = this.getEligibleTargets(state);

    if (!eligibleTargets.length) {
      errors.push("No eligible targets for damage roll");
    }

    const actor = this.getActor(state);
    const weapon = this.getWeapon(state);
    
    if (!actor) errors.push("Cannot find actor");
    if (!weapon) errors.push("Cannot find weapon");

    return errors;
  }

  getEligibleTargets(state) {
    const saveOnly = !!state?.options?.saveOnly;
    const isManualDamage = !!state?.options?.manualDamage;
    
    return (state.targets || []).filter(t => {
      if (t.missing) return false;
      if (t.damage && t.damage.total != null) return false; // Already rolled
      
      if (saveOnly || isManualDamage) return true;
      
      const status = String(t?.summary?.status || "");
      return ["hit", "crit", "manual-damage"].includes(status);
    });
  }
}

/**
 * Modified damage roll with dialog
 */
export class ModDamageAction extends BaseCardAction {
  async execute(message, state, context) {
    const eligibleTargets = this.getEligibleTargets(state);
    await this.openDamageDialog(message, state, eligibleTargets, { 
      separate: !!state.options?.separate 
    });
  }

  validate(message, state, context) {
    const errors = [];
    const eligibleTargets = this.getEligibleTargets(state);

    if (!eligibleTargets.length) {
      errors.push("No eligible targets for damage roll");
    }

    return errors;
  }

  getEligibleTargets(state) {
    const saveOnly = !!state?.options?.saveOnly;
    const isManualDamage = !!state?.options?.manualDamage;
    
    return (state.targets || []).filter(t => {
      if (t.missing) return false;
      if (t.damage && t.damage.total != null) return false;
      
      if (saveOnly || isManualDamage) return true;
      
      const status = String(t?.summary?.status || "");
      return ["hit", "crit", "manual-damage"].includes(status);
    });
  }

  async openDamageDialog(message, state, targets, options = {}) {
  const actor = this.getActor(state);
  const weapon = this.getWeapon(state);
  
  if (!actor || !weapon) {
    ui.notifications.error("Cannot resolve actor or weapon");
    return;
  }

  const hasCrit = targets.some(t => String(t?.summary?.status) === "crit");
  const seed = {
    weaponId: state.itemId,
    ability: state.options?.smart ? "manual" : "",
    offhand: !!state.options?.offhand,
    smart: !!state.options?.smart,
    smartAbility: state.options?.smartAbility || 0,
    separate: !!options.separate,
    isCrit: hasCrit && !options.separate,
    extraRows: [],
    packState: state.packState || {}
  };

  try {
    //const dialog = new DamageDialog({ 
    const result = await openDamageDialog({
      actor, 
      item: weapon, 
      seed,
      scope: options.targetRef ? 
        { type: "row", ref: options.targetRef } : 
        { type: "card" }
    });
          
    if (result) {
      await this.processDamageDialogResult(message, state, targets, result, options);
    }
  } catch (error) {
    console.error("SW5E Helper: Damage dialog error", error);
  }
  }

  async processDamageDialogResult(message, state, targets, result, options) {
    const actor = this.getActor(state);
    const weapon = this.getWeapon(state);

    // Apply pack modifications to dialog result
    let damageData = result;
    if (result.packState) {
      damageData = PackRegistry.modifyDamage(damageData, result.packState, actor, weapon);
    }

    const targetRefs = targets.map(t => `${t.sceneId}:${t.tokenId}`);
    const critMap = Object.fromEntries(targets.map(t => [
      `${t.sceneId}:${t.tokenId}`,
      String(t?.summary?.status) === "crit" || (!!result.isCrit && !options.targetRef)
    ]));

    ConfigHelper.debug("damage", "Modified damage roll", {
      result,
      damageData,
      targetRefs,
      critMap
    });

    const { perTargetTotals, perTargetTypes, rolls, info } = await rollDamageForTargets({
      actor, 
      item: weapon, 
      dmgState: damageData, 
      targetRefs, 
      critMap, 
      separate: !!result.separate
    });

    // Update targets
    for (const target of targets) {
      const ref = `${target.sceneId}:${target.tokenId}`;
      const total = perTargetTotals.get(ref);
      
      if (total != null) {
        target.damage = { 
          total, 
          types: perTargetTypes.get(ref) || { kinetic: total }, 
          info 
        };
      }
    }

    // Consume pack resources
    if (result.packState) {
      try {
        await PackRegistry.consumeResources(result.packState, actor, weapon);
      } catch (error) {
        console.error("SW5E Helper: Error consuming pack resources", error);
      }
    }

    if (rolls?.length) await this.appendRolls(message, rolls);
    await this.updateMessage(message, state);
  }
}

/**
 * Modified damage roll for a specific row/target
 */
export class RowModDamageAction extends ModDamageAction {
  async execute(message, state, context) {
    const { ref, element } = context;
    const target = this.getTargetRow(state, ref);
    
    if (!target || target.missing) {
      ui.notifications.warn("Invalid target for damage roll");
      return;
    }

    // Prevent multiple clicks
    if (element) {
      element.style.pointerEvents = 'none';
      element.style.opacity = '0.5';
    }
    
    try {
      await this.openDamageDialog(message, state, [target], { 
        separate: true, 
        targetRef: ref 
      });
    } finally {
      if (element) {
        element.style.pointerEvents = '';
        element.style.opacity = '';
      }
    }
  }

  validate(message, state, context) {
    const errors = [];
    const { ref } = context;
    const target = this.getTargetRow(state, ref);

    if (!target) {
      errors.push("Target not found");
    } else if (target.missing) {
      errors.push("Cannot roll damage for missing target");
    } else if (target.damage && target.damage.total != null) {
      errors.push("Damage already rolled for this target");
    }

    return errors;
  }
}