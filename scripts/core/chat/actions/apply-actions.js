// scripts/core/chat/actions/apply-actions.js
// SW5E Helper - Apply Damage Action Handlers
// Handles damage application to actors

import { BaseCardAction } from "./BaseCardAction.js";
import { ConfigHelper, SW5E_CONFIG } from "../../config.js";
import { applyDamage } from "../../engine/apply-damage.js";

/**
 * Apply damage to a single target
 */
export class ApplyDamageAction extends BaseCardAction {
  constructor(mode = "full") {
    super();
    this.mode = mode; // "full", "half", "none"
  }

  async execute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    const { actor } = this.resolveToken(ref);
    
    if (!actor) {
      ui.notifications.error("Cannot find actor to apply damage");
      return;
    }

    try {
      const result = await applyDamage(actor, target.damage.types, this.mode);
      
      target.damage.applied = this.mode;
      target.damage.appliedAmount = result.totalDamageApplied;
      target.damage.appliedResult = result; // Store for potential rollback
      
      ConfigHelper.debug("apply", "Damage applied", {
        target: target.name,
        mode: this.mode,
        amount: result.totalDamageApplied,
        success: result.success
      });

      // Show notification
      const modeText = this.mode === "full" ? "full" : 
                      this.mode === "half" ? "half" : "no";
      ui.notifications.info(`Applied ${modeText} damage (${result.totalDamageApplied}) to ${target.name}`);

      await this.updateMessage(message, state);
      
    } catch (error) {
      console.error("SW5E Helper: Error applying damage", error);
      ui.notifications.error(`Failed to apply damage: ${error.message}`);
    }
  }

  validate(message, state, context) {
    const errors = [];
    const { ref } = context;
    const target = this.getTargetRow(state, ref);

    if (!target) {
      errors.push("Target not found");
    } else if (target.missing) {
      errors.push("Cannot apply damage to missing target");
    } else if (!target.damage || target.damage.total == null) {
      errors.push("No damage rolled for this target");
    } else if (target.damage.applied) {
      errors.push("Damage already applied to this target");
    }

    return errors;
  }

  canExecute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    
    // Can apply if user is GM or owns the target
    return game.user?.isGM || this.canControlTarget(target);
  }
}

/**
 * GM bulk action to apply full damage to all eligible targets
 */
export class GMApplyAllDamageAction extends BaseCardAction {
  async execute(message, state, context) {
    const eligibleTargets = this.getEligibleTargets(state);
    
    if (!eligibleTargets.length) {
      ui.notifications.info("No eligible targets for damage application");
      return;
    }

    let appliedCount = 0;
    let totalDamage = 0;

    for (const target of eligibleTargets) {
      const { actor } = this.resolveToken(`${target.sceneId}:${target.tokenId}`);
      
      if (!actor) {
        ConfigHelper.debug("apply", `Skipping ${target.name} - no actor found`);
        continue;
      }

      try {
        const result = await applyDamage(actor, target.damage.types, "full");
        
        target.damage.applied = "full";
        target.damage.appliedAmount = result.totalDamageApplied;
        target.damage.appliedResult = result;
        
        appliedCount++;
        totalDamage += result.totalDamageApplied;
        
        ConfigHelper.debug("apply", "GM bulk damage applied", {
          target: target.name,
          amount: result.totalDamageApplied
        });
        
      } catch (error) {
        console.error(`SW5E Helper: Error applying damage to ${target.name}`, error);
      }
    }

    await this.updateMessage(message, state);
    
    if (appliedCount > 0) {
      ui.notifications.info(`Applied full damage to ${appliedCount} targets (${totalDamage} total damage)`);
    } else {
      ui.notifications.warn("Failed to apply damage to any targets");
    }
  }

  canExecute(message, state, context) {
    return game.user?.isGM === true;
  }

  validate(message, state, context) {
    const errors = [];
    const eligibleTargets = this.getEligibleTargets(state);

    if (!eligibleTargets.length) {
      errors.push("No eligible targets for damage application");
    }

    return errors;
  }

  getEligibleTargets(state) {
    return (state.targets || []).filter(t => 
      t.damage && 
      t.damage.total != null && 
      !t.damage.applied && 
      !t.missing
    );
  }
}

/**
 * Rollback damage application (utility action)
 */
export class RollbackDamageAction extends BaseCardAction {
  async execute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    const { actor } = this.resolveToken(ref);
    
    if (!actor || !target?.damage?.appliedResult) {
      ui.notifications.error("Cannot rollback damage - missing data");
      return;
    }

    try {
      // Import rollback function (would be in apply-damage.js)
      const { rollbackDamage } = await import("../../engine/apply-damage.js");
      
      const success = await rollbackDamage(actor, target.damage.appliedResult);
      
      if (success) {
        // Clear applied status
        target.damage.applied = null;
        target.damage.appliedAmount = null;
        target.damage.appliedResult = null;
        
        ui.notifications.info(`Rolled back damage for ${target.name}`);
        await this.updateMessage(message, state);
      } else {
        ui.notifications.error("Failed to rollback damage");
      }
      
    } catch (error) {
      console.error("SW5E Helper: Error rolling back damage", error);
      ui.notifications.error(`Rollback failed: ${error.message}`);
    }
  }

  canExecute(message, state, context) {
    return game.user?.isGM === true; // Only GM can rollback
  }

  validate(message, state, context) {
    const errors = [];
    const { ref } = context;
    const target = this.getTargetRow(state, ref);

    if (!target) {
      errors.push("Target not found");
    } else if (!target.damage?.applied) {
      errors.push("No applied damage to rollback");
    } else if (!target.damage?.appliedResult) {
      errors.push("Missing rollback data");
    }

    return errors;
  }
}