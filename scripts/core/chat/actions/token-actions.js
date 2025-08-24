// scripts/core/chat/actions/token-actions.js
// SW5E Helper - Token Action Handlers  
// Handles token ping/select interactions

import { BaseCardAction } from "./BaseCardAction.js";

/**
 * Ping a token on the canvas
 */
export class PingTokenAction extends BaseCardAction {
  async execute(message, state, context) {
    const { ref } = context;
    const { token,canvas } = this.resolveToken(ref);
    //console.log("canvas, token", { canvas, token });
    if (token != null && canvas != null) {
      canvas.ping(token.center); /*, { 
        scene, 
        duration: 800, 
        color: "#ff6400" 
      });   */
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
    console.log("SW5E HELPER select token:", token);
    if (token != null) {
      token.control({ releaseOthers: true });
    }
  }

  canExecute(message, state, context) {
    const { ref } = context;
    const target = this.getTargetRow(state, ref);
    console.log("SW5E HELPER canExecute-target:", target);
    return this.canControlTarget(target, ref);
  }
}