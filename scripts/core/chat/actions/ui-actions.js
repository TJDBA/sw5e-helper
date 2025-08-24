// scripts/core/chat/actions/ui-actions.js
// SW5E Helper - UI Action Handlers
// Handles UI state changes like expand/collapse

import { BaseCardAction } from "./BaseCardAction.js";

/**
 * Toggle expand/collapse all target rows
 */
export class ToggleAllAction extends BaseCardAction {
  async execute(message, state, context) {
    state.ui = state.ui || {};
    state.ui.expandedAll = !state.ui.expandedAll;
    
    await this.updateMessage(message, state);
  }
}