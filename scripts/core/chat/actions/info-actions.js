// scripts/core/chat/actions/info-actions.js
// SW5E Helper - Info Action Handlers
// Handles tooltip/info display actions

import { BaseCardAction } from "./BaseCardAction.js";

/**
 * Show attack formula breakdown as notification
 */
export class ShowAttackFormulaAction extends BaseCardAction {
  async execute(message, state, context) {
    if (state.attack?.info) {
      ui.notifications.info(state.attack.info);
    }
  }

  validate(message, state, context) {
    const errors = [];
    if (!state.attack?.info) {
      errors.push("No attack formula information available");
    }
    return errors;
  }
}

/**
 * Show damage formula breakdown as notification
 */
export class ShowDamageFormulaAction extends BaseCardAction {
  async execute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    
    if (target?.damage?.info) {
      ui.notifications.info(target.damage.info);
    }
  }

  validate(message, state, context) {
    const errors = [];
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    
    if (!target) {
      errors.push("Target not found");
    } else if (!target.damage?.info) {
      errors.push("No damage formula information available for this target");
    }
    
    return errors;
  }
}