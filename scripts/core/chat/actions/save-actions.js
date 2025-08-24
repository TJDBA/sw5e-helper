// scripts/core/chat/actions/save-actions.js
// SW5E Helper - Save Action Handlers
// Handles saving throw rolling actions

import { BaseCardAction } from "./BaseCardAction.js";
import { ConfigHelper } from "../../config.js";

/**
 * Roll a saving throw for a specific target
 */
export class RollSaveAction extends BaseCardAction {
  async execute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    const { actor } = this.resolveToken(ref);
    
    if (!actor) {
      ui.notifications.warn("Cannot find actor for save roll");
      return;
    }

    const abilityKey = target.save?.ability?.toLowerCase() || "cha";
    let saveMod = 0;
    
    if (abilityKey !== "flat") {
      const abilityData = actor.system?.abilities?.[abilityKey];
      saveMod = abilityData?.save ?? abilityData?.mod ?? 0;
    }

    const roll = new Roll(`1d20+${saveMod}`);
    await roll.evaluate({ async: true });
    
    // Trigger DSN animation
    try { 
      await game.dice3d?.showForRoll?.(roll, game.user, true); 
    } catch (_) {
      ConfigHelper.debug("saves", "DSN animation failed or not available");
    }

    const dc = Number(target.save?.dc ?? Infinity);
    const d20 = roll.terms?.find?.(t => t.faces === 20)?.results?.[0]?.result;
    let outcome = roll.total >= dc ? "success" : "fail";
    
    // Optional: Handle natural 20/1 as critical success/failure
    // if (d20 === 20) outcome = "critical";
    // if (d20 === 1) outcome = "fumble";

    target.save.roll = { 
      total: roll.total, 
      formula: roll.formula, 
      outcome 
    };

    ConfigHelper.debug("saves", "Save roll completed", {
      target: target.name,
      ability: abilityKey,
      modifier: saveMod,
      roll: roll.total,
      dc,
      outcome
    });

    await this.appendRolls(message, [roll]);
    await this.updateMessage(message, state);
  }

  validate(message, state, context) {
    const errors = [];
    const { ref } = context;
    const target = this.getTargetRow(state, ref);

    if (!target) {
      errors.push("Target not found");
    } else if (target.missing) {
      errors.push("Cannot roll save for missing target");
    } else if (!target.save) {
      errors.push("No save information available for this target");
    } else if (target.save.roll) {
      errors.push("Save already rolled for this target");
    }

    return errors;
  }
}

/**
 * GM action to roll saves for all eligible targets
 */
export class GMRollAllSavesAction extends BaseCardAction {
  async execute(message, state, context) {
    const eligibleTargets = (state.targets || []).filter(t => 
      t.save && !t.save.roll && !t.missing
    );

    if (!eligibleTargets.length) {
      ui.notifications.info("No eligible targets for save rolls");
      return;
    }

    const allRolls = [];

    for (const target of eligibleTargets) {
      const ref = `${target.sceneId}:${target.tokenId}`;
      const { actor } = this.resolveToken(ref);
      
      if (!actor) {
        ConfigHelper.debug("saves", `Skipping save for ${target.name} - no actor found`);
        continue;
      }

      const abilityKey = target.save?.ability?.toLowerCase() || "wis";
      let saveMod = 0;
      
      if (abilityKey !== "flat") {
        const abilityData = actor.system?.abilities?.[abilityKey];
        saveMod = abilityData?.save ?? abilityData?.mod ?? 0;
      }

      const roll = new Roll(`1d20+${saveMod}`);
      await roll.evaluate({ async: true });
      
      // Trigger DSN for each roll
      try { 
        await game.dice3d?.showForRoll?.(roll, game.user, true); 
      } catch (_) {}

      const dc = Number(target.save?.dc ?? Infinity);
      let outcome = roll.total >= dc ? "success" : "fail";

      target.save.roll = { 
        total: roll.total, 
        formula: roll.formula, 
        outcome 
      };

      allRolls.push(roll);

      ConfigHelper.debug("saves", "GM bulk save roll", {
        target: target.name,
        result: roll.total,
        outcome
      });
    }

    if (allRolls.length) {
      await this.appendRolls(message, allRolls);
      await this.updateMessage(message, state);
    }

    ui.notifications.info(`Rolled saves for ${allRolls.length} targets`);
  }

  canExecute(message, state, context) {
    return game.user?.isGM === true;
  }

  validate(message, state, context) {
    const errors = [];
    const eligibleTargets = (state.targets || []).filter(t => 
      t.save && !t.save.roll && !t.missing
    );

    if (!eligibleTargets.length) {
      errors.push("No eligible targets for save rolls");
    }

    return errors;
  }
}