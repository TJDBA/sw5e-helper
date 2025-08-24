// scripts/core/chat/actions/index.js
// SW5E Helper - Card Action Command System
// Replaces large switch statement with command pattern for better maintainability

import { ConfigHelper, SW5E_CONFIG } from "../../config.js";
import { BaseCardAction } from "./BaseCardAction.js";
// Import individual action handlers
import { ToggleAllAction } from "./ui-actions.js";
import { PingTokenAction, SelectTokenAction } from "./token-actions.js";
import { ShowAttackFormulaAction, ShowDamageFormulaAction } from "./info-actions.js";
import { RollSaveAction, GMRollAllSavesAction } from "./save-actions.js";
import { 
  QuickDamageAction, 
  ModDamageAction, 
  RowModDamageAction 
} from "./damage-actions.js";
import { 
  ApplyDamageAction, 
  GMApplyAllDamageAction 
} from "./apply-actions.js";

/**
 * Registry of all available card actions
 */
export const CARD_ACTIONS = {
  // UI Controls
  [SW5E_CONFIG.CARD_ACTIONS.TOGGLE_ALL]: new ToggleAllAction(),
  
  // Token interactions
  [SW5E_CONFIG.CARD_ACTIONS.PING_TOKEN]: new PingTokenAction(),
  [SW5E_CONFIG.CARD_ACTIONS.SELECT_TOKEN]: new SelectTokenAction(),
  
  // Info displays
  [SW5E_CONFIG.CARD_ACTIONS.SHOW_ATTACK_FORMULA]: new ShowAttackFormulaAction(),
  [SW5E_CONFIG.CARD_ACTIONS.SHOW_DAMAGE_FORMULA]: new ShowDamageFormulaAction(),
  
  // Save rolling
  [SW5E_CONFIG.CARD_ACTIONS.ROLL_SAVE]: new RollSaveAction(),
  [SW5E_CONFIG.CARD_ACTIONS.GM_ROLL_ALL_SAVES]: new GMRollAllSavesAction(),
  
  // Damage rolling
  [SW5E_CONFIG.CARD_ACTIONS.CARD_QUICK_DAMAGE]: new QuickDamageAction(),
  [SW5E_CONFIG.CARD_ACTIONS.GM_ROLL_DAMAGE]: new QuickDamageAction(), // Same as quick damage
  [SW5E_CONFIG.CARD_ACTIONS.CARD_MOD_DAMAGE]: new ModDamageAction(),
  [SW5E_CONFIG.CARD_ACTIONS.ROW_MOD_DAMAGE]: new RowModDamageAction(),
  
  // Damage application
  [SW5E_CONFIG.CARD_ACTIONS.APPLY_FULL]: new ApplyDamageAction("full"),
  [SW5E_CONFIG.CARD_ACTIONS.APPLY_HALF]: new ApplyDamageAction("half"),
  [SW5E_CONFIG.CARD_ACTIONS.APPLY_NONE]: new ApplyDamageAction("none"),
  [SW5E_CONFIG.CARD_ACTIONS.GM_APPLY_ALL_FULL]: new GMApplyAllDamageAction()
};

/**
 * Execute a card action by name
 * @param {string} actionName - Name of action to execute
 * @param {ChatMessage} message - Chat message
 * @param {Object} state - Card state
 * @param {Object} context - Action context
 * @returns {Promise} Action result
 */
export async function executeCardAction(actionName, message, state, context) {
  const action = CARD_ACTIONS[actionName];
  
  if (!action) {
    console.warn(`SW5E Helper: Unknown card action: ${actionName}`);
    return;
  }

  try {
    // Check permissions
    if (!action.canExecute(message, state, context)) {
      ui.notifications.warn("You don't have permission to perform this action");
      return;
    }

    // Validate prerequisites
    const errors = action.validate(message, state, context);
    if (errors.length > 0) {
      ui.notifications.warn(`Action failed: ${errors.join(", ")}`);
      return;
    }

    ConfigHelper.debug("cards", `Executing action: ${actionName}`, { 
      context,
      state: { kind: state.kind, targets: state.targets?.length } 
    });

    // Execute the action
    await action.execute(message, state, context);

  } catch (error) {
    console.error(`SW5E Helper: Error executing action '${actionName}'`, error);
    ui.notifications.error(`Action failed: ${error.message}`);
  }
}

/**
 * Get available actions for a given context
 * @param {Object} state - Card state
 * @param {Object} context - Action context
 * @returns {Array} Array of available action names
 */
export function getAvailableActions(state, context) {
  return Object.entries(CARD_ACTIONS)
    .filter(([name, action]) => action.canExecute(null, state, context))
    .map(([name]) => name);
}