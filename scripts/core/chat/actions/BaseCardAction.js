// scripts/core/chat/actions/BaseCardAction.js
// SW5E Helper - Base Card Action Class
// Extracted to prevent circular import dependencies

import { renderAttackCard } from "../card-renderer.js";

/**
 * Base class for all card actions
 */
export class BaseCardAction {
  /**
   * Execute the action
   * @param {ChatMessage} message - Chat message being acted upon
   * @param {Object} state - Current card state
   * @param {Object} context - Action context (element, ref, etc.)
   * @returns {Promise} Action result
   */
  async execute(message, state, context) {
    throw new Error(`Action ${this.constructor.name} must implement execute() method`);
  }

  /**
   * Check if user can perform this action
   * @param {ChatMessage} message - Chat message
   * @param {Object} state - Card state
   * @param {Object} context - Action context
   * @returns {boolean} True if action is allowed
   */
  canExecute(message, state, context) {
    return true; // Override in subclasses for permission checks
  }

  /**
   * Validate action prerequisites
   * @param {ChatMessage} message - Chat message
   * @param {Object} state - Card state
   * @param {Object} context - Action context
   * @returns {Array} Array of validation errors (empty if valid)
   */
  validate(message, state, context) {
    return []; // Override in subclasses for validation
  }

  /* ----------------------------- Helper Methods ----------------------------- */

  /**
   * Update message with new state and re-render
   * @param {ChatMessage} message - Message to update
   * @param {Object} state - New state
   * @param {Array} rolls - Additional rolls to append
   * @returns {Promise} Update result
   */
  async updateMessage(message, state, rolls = []) {
    const payload = {
      content: renderAttackCard(state),
      flags: { "sw5e-helper": { state } }
    };
    
    if (rolls.length) {
      payload.rolls = [...(message.rolls || []), ...rolls];
    }
    
    return message.update(payload);
  }

  /**
   * Append rolls to message without changing content
   * @param {ChatMessage} message - Message to update
   * @param {Array} rolls - Rolls to append
   * @returns {Promise} Update result
   */
  async appendRolls(message, rolls) {
    if (!rolls?.length) return;
    return message.update({ 
      rolls: [...(message.rolls || []), ...rolls] 
    });
  }

  /**
   * Find target row by reference
   * @param {Object} state - Card state
   * @param {string} ref - Target reference (sceneId:tokenId)
   * @returns {Object|null} Target row or null
   */
  getTargetRow(state, ref) {
    if (!ref) return null;
    return (state.targets || []).find(t => 
      `${t.sceneId}:${t.tokenId}` === ref
    ) || null;
  }

  /**
   * Get actor from state
   * @param {Object} state - Card state
   * @returns {Actor|null} Actor or null
   */
  getActor(state) {
    return game.actors?.get(state.actorId) || null;
  }

  /*
   * Get weapon item from state
   * @param {Object} state - Card state
   * @returns {Item|null} Item or null
   
  getWeapon(state) {
    const actor = this.getActor(state);
    return actor?.items?.get(state.itemId) || null;
  }*/
  /**
 * Return a real Item for damage workflows.
 * Accepts Item or id in state.item | state.weapon | state.itemId | state.weaponId.
 */
getWeapon(state) {
  const actor = this.getActor(state);

  const candidate =
    state?.item ??
    state?.weapon ??
    state?.itemId ??
    state?.weaponId;

  if (!candidate) return null;

  // Already an Item document
  if (candidate?.documentName === "Item" || candidate?.type) return candidate;

  // Resolve id → Item (prefer owned item)
  const id = String(candidate);
  return actor?.items?.get?.(id) ?? game.items?.get?.(id) ?? null;
}

  /**
   * Resolve token from scene:token reference
   * @param {string} ref - Token reference
   * @returns {Object} { scene, token, actor }
   */
  resolveToken(ref) {
    if (!ref) return { scene: null, token: null, actor: null };
    
    const [sceneId, tokenId] = ref.split(":");
    const scene = game.scenes?.get(sceneId) || canvas?.scene;
    const token = scene?.tokens?.get(tokenId);
    const actor = token?.actor || null;
    
    return { scene, token, actor };
  }

  /**
   * Check if current user can control a target
   * @param {Object} target - Target row data
   * @returns {boolean} True if user can control
   */
  canControlTarget(target) {
    try {
      const actor = target._actor || game.actors?.get(target.actorId);
      if (!actor) return false;
      
      return game.user?.isGM || 
             actor.isOwner === true || 
             (actor.ownership?.[game.userId] >= 3);
    } catch {
      return game.user?.isGM === true;
    }
  }
}