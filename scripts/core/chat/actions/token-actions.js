// scripts/core/chat/actions/token-actions.js
// SW5E Helper - Token Action Handlers  
// Handles token ping/select interactions

import { BaseCardAction } from "./index.js";

/**
 * Ping a token on the canvas
 */
export class PingTokenAction extends BaseCardAction {
  async execute(message, state, context) {
    const { ref } = context;
    const { scene, token } = this.resolveToken(ref);
    
    if (token?.object && canvas?.ping) {
      canvas.ping(token.object.center, { 
        scene, 
        duration: 800, 
        color: "#ff6400" 
      });
    }
  }
}

/**
 * Select and control a token
 */
export class SelectTokenAction extends BaseCardAction {
  async execute(message, state, context) {
    const { ref } = context;
    const { token } = this.resolveToken(ref);
    
    if (token?.object) {
      token.object.control({ releaseOthers: true });
    }
  }

  canExecute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    return this.canControlTarget(target);
  }
}