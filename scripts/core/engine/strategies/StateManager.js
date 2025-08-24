// scripts/core/services/StateManager.js
// SW5E Helper - Centralized State Management
// Single source of truth for card and dialog state

import { ConfigHelper, SW5E_CONFIG } from "../../config.js";
import { PackRegistry } from "../../../packs/pack-registry.js";
import { renderAttackCard } from "../chat/card-renderer.js";

export class StateManager {
  /**
   * Create attack card state
   * @param {Object} options - State creation options
   * @returns {Object} Complete attack state
   */
  static createAttackState(options = {}) {
    const {
      actor,
      item,
      targets = [],
      attackResult = null,
      options: attackOptions = {},
      packState = {}
    } = options;

    // Build target array with proper structure
    const processedTargets = targets.map((target, index) => {
      const baseTarget = {
        sceneId: target.sceneId || canvas.scene?.id || "",
        tokenId: target.tokenId || target.id,
        name: target.name || "Unknown",
        img: target.img || target.document?.texture?.src || "",
        missing: !target.actor,
        _actor: target.actor
      };

      // Add attack results if available
      if (attackResult?.targets?.length) {
        const result = attackResult.targets.find(r => r.tokenId === target.tokenId);
        if (result) {
          baseTarget.summary = {
            keptDie: result.kept,
            attackTotal: result.total,
            status: result.status
          };
        }
      }

      // Add save information if configured
      if (attackOptions.saveOnHit || attackOptions.saveOnly) {
        const saveAbility = attackOptions.saveAbility || "wis";
        const saveDC = this.calculateSaveDC(
          attackOptions.saveDcFormula || "8 + @prof + @mod",
          actor
        );

        if (saveDC != null) {
          baseTarget.save = {
            ability: saveAbility,
            dc: saveDC,
            formula: attackOptions.saveDcFormula
          };
        }
      }

      return baseTarget;
    });

    return {
      kind: "attack",
      messageId: null,
      authorId: game.user.id,
      actorId: actor.id,
      itemId: item?.id,
      weaponId: item?.id,
      itemName: item?.name,
      weaponImg: item?.img || item?.system?.img,
      hasSave: processedTargets.some(t => t.save && t.save.dc != null),
      
      // Attack-specific data
      attack: attackResult ? {
        info: attackResult.info,
        advState: attackOptions.adv || "normal"
      } : null,
      
      // Options
      options: {
        separate: !!attackOptions.separate,
        adv: attackOptions.adv || "normal",
        saveOnly: !!attackOptions.saveOnly,
        saveOnHit: !!attackOptions.saveOnHit,
        smart: !!attackOptions.smart,
        smartAbility: Number(attackOptions.smartAbility ?? 0),
        smartProf: Number(attackOptions.smartProf ?? 0),
        offhand: !!attackOptions.offhand,
        itemAttackBonus: this.getItemAttackBonus(actor, item),
        packState
      },
      
      targets: processedTargets,
      ui: { expandedAll: false }
    };
  }

  /**
   * Create manual damage card state
   * @param {Object} options - State creation options  
   * @returns {Object} Complete damage state
   */
  static createManualDamageState(options = {}) {
    const {
      actor,
      item,
      targets = [],
      damageResults = {},
      damageOptions = {},
      packState = {}
    } = options;

    const processedTargets = targets.map((target) => ({
      sceneId: target.sceneId || canvas.scene?.id || "",
      tokenId: target.tokenId || target.id,
      name: target.name || "Unknown",
      img: target.img || target.document?.texture?.src || "",
      missing: !target.actor,
      summary: { status: "manual-damage" },
      damage: damageResults.perTargetTotals?.get(`${target.sceneId}:${target.tokenId}`) ? {
        total: damageResults.perTargetTotals.get(`${target.sceneId}:${target.tokenId}`),
        types: damageResults.perTargetTypes?.get(`${target.sceneId}:${target.tokenId}`) || {},
        info: damageResults.info || ""
      } : null
    }));

    return {
      kind: "manual-damage",
      messageId: null,
      authorId: game.user.id,
      actorId: actor.id,
      itemId: item?.id,
      weaponId: item?.id,
      itemName: item?.name,
      weaponImg: item?.img || item?.system?.img,
      hasSave: false,
      
      options: {
        separate: !!damageOptions.separate,
        manualDamage: true,
        packState
      },
      
      targets: processedTargets,
      ui: { expandedAll: false }
    };
  }

  /**
   * Update card state in message
   * @param {ChatMessage} message - Message to update
   * @param {Object} updates - State updates
   * @returns {Promise} Update result
   */
  static async updateCardState(message, updates) {
    const currentState = this.getCardState(message);
    if (!currentState) {
      throw new Error("No card state found in message");
    }

    const newState = foundry.utils.mergeObject(currentState, updates);
    
    // Validate the new state
    const errors = this.validateState(newState, currentState.kind);
    if (errors.length > 0) {
      throw new Error(`State validation failed: ${errors.join(", ")}`);
    }

    const payload = {
      content: renderAttackCard(newState),
      flags: { "sw5e-helper": { state: newState } }
    };

    return message.update(payload);
  }

  /**
   * Get card state from message
   * @param {ChatMessage} message - Message to read
   * @returns {Object|null} Card state or null
   */
  static getCardState(message) {
    return message?.flags?.["sw5e-helper"]?.state || null;
  }

  /**
   * Validate state structure
   * @param {Object} state - State to validate
   * @param {string} kind - State kind ("attack", "damage", etc.)
   * @returns {Array} Validation errors (empty if valid)
   */
  static validateState(state, kind) {
    const errors = [];

    // Basic structure validation
    if (!state || typeof state !== "object") {
      errors.push("Invalid state object");
      return errors;
    }

    // Required fields
    const required = ["kind", "authorId", "actorId", "targets"];
    for (const field of required) {
      if (!(field in state)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate targets array
    if (!Array.isArray(state.targets)) {
      errors.push("Targets must be an array");
    } else {
      state.targets.forEach((target, i) => {
        if (!target.sceneId || !target.tokenId) {
          errors.push(`Target ${i} missing sceneId or tokenId`);
        }
      });
    }

    // Validate pack state if present
    if (state.options?.packState) {
      const packErrors = PackRegistry.validatePackState(
        state.options.packState,
        game.actors.get(state.actorId),
        game.actors.get(state.actorId)?.items.get(state.itemId)
      );
      errors.push(...packErrors);
    }

    return errors;
  }

  /**
   * Calculate save DC from formula
   * @param {string} formula - DC formula
   * @param {Actor} actor - Actor for roll data
   * @returns {number|null} Calculated DC or null
   */
  static calculateSaveDC(formula, actor) {
    if (!formula || !formula.trim()) return null;
    
    try {
      const rollData = actor.getRollData?.() || {};
      const roll = new Roll(formula, rollData);
      
      // Evaluate synchronously for DC calculation
      if (typeof roll.evaluate === "function") {
        roll.evaluate({ async: false });
      } else if (typeof roll.roll === "function") {
        roll.roll({ async: false });
      }
      
      return roll.total;
    } catch (error) {
      ConfigHelper.debug("state", "Save DC calculation failed", { formula, error });
      
      // Try simple number parsing as fallback
      const numMatch = String(formula).match(/^\s*(\d+)\s*$/);
      return numMatch ? Number(numMatch[1]) : null;
    }
  }

  /**
   * Get item attack bonus for display
   * @param {Actor} actor - The actor
   * @param {Item} item - The weapon item
   * @returns {number} Attack bonus
   */
  static getItemAttackBonus(actor, item) {
    if (!item) return 0;
    
    const sys = item.system ?? {};
    const direct = Number(sys.attackBonus) || Number(sys.attack?.bonus) || 0;
    if (direct) return direct;

    const fromBonuses = 
      Number(sys.bonuses?.weapon?.attack) ||
      Number(sys.bonuses?.mwak?.attack) ||
      Number(sys.bonuses?.rwak?.attack) ||
      0;
      
    return fromBonuses;
  }

  /**
   * Create target reference string
   * @param {Object} target - Target data
   * @returns {string} Reference string
   */
  static createTargetRef(target) {
    return `${target.sceneId}:${target.tokenId}`;
  }

  /**
   * Find target by reference in state
   * @param {Object} state - Card state
   * @param {string} ref - Target reference
   * @returns {Object|null} Target or null
   */
  static findTargetByRef(state, ref) {
    if (!ref || !state.targets) return null;
    return state.targets.find(t => this.createTargetRef(t) === ref) || null;
  }

  /**
   * Apply pack modifications to state
   * @param {Object} state - State to modify
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   * @returns {Object} Modified state
   */
  static applyPackModifications(state, actor, weapon) {
    if (!state.options?.packState) return state;

    // Apply pack modifications based on state kind
    let modifiedState = { ...state };
    
    if (state.kind === "attack") {
      const attackData = PackRegistry.modifyAttack(
        state.options,
        state.options.packState,
        actor,
        weapon
      );
      modifiedState.options = { ...modifiedState.options, ...attackData };
    }
    
    // Damage modifications would be applied during damage rolling
    return modifiedState;
  }

  /**
   * Merge pack state updates
   * @param {Object} currentState - Current state
   * @param {Object} packUpdates - Pack state updates
   * @returns {Object} Updated state
   */
  static mergePackState(currentState, packUpdates) {
    const newState = { ...currentState };
    
    if (!newState.options) newState.options = {};
    if (!newState.options.packState) newState.options.packState = {};
    
    // Merge pack state updates
    newState.options.packState = {
      ...newState.options.packState,
      ...packUpdates
    };
    
    return newState;
  }

  /**
   * Clean state for storage (remove transient data)
   * @param {Object} state - State to clean
   * @returns {Object} Cleaned state
   */
  static cleanStateForStorage(state) {
    const cleaned = { ...state };
    
    // Remove runtime-only data
    if (cleaned.targets) {
      cleaned.targets = cleaned.targets.map(target => {
        const cleanTarget = { ...target };
        delete cleanTarget._actor; // Remove actor reference
        return cleanTarget;
      });
    }
    
    return cleaned;
  }

  /**
   * Restore state after loading (re-populate transient data)
   * @param {Object} state - State to restore
   * @returns {Object} Restored state
   */
  static restoreStateFromStorage(state) {
    const restored = { ...state };
    
    // Re-populate actor references
    if (restored.targets) {
      restored.targets = restored.targets.map(target => {
        const restoredTarget = { ...target };
        
        // Try to re-resolve actor
        const scene = game.scenes.get(target.sceneId);
        const token = scene?.tokens.get(target.tokenId);
        if (token?.actor) {
          restoredTarget._actor = token.actor;
          restoredTarget.missing = false;
        } else {
          restoredTarget.missing = true;
        }
        
        return restoredTarget;
      });
    }
    
    return restored;
  }

  /**
   * Get state summary for debugging
   * @param {Object} state - State to summarize
   * @returns {Object} State summary
   */
  static getStateSummary(state) {
    if (!state) return { valid: false, error: "No state" };
    
    return {
      valid: true,
      kind: state.kind,
      actorId: state.actorId,
      weaponId: state.weaponId,
      targetCount: state.targets?.length || 0,
      hasAttackResults: !!(state.attack && state.targets?.some(t => t.summary)),
      hasDamageResults: !!(state.targets?.some(t => t.damage)),
      hasSaves: state.hasSave,
      packCount: Object.keys(state.options?.packState || {}).length,
      messageId: state.messageId
    };
  }

  /**
   * Export state for external use (testing, debugging)
   * @param {Object} state - State to export
   * @returns {Object} Exportable state data
   */
  static exportState(state) {
    const summary = this.getStateSummary(state);
    const cleaned = this.cleanStateForStorage(state);
    
    return {
      summary,
      state: cleaned,
      timestamp: Date.now(),
      version: "2.0"
    };
  }

  /**
   * Import state from external source
   * @param {Object} exportedData - Exported state data
   * @returns {Object} Imported state
   */
  static importState(exportedData) {
    if (!exportedData || !exportedData.state) {
      throw new Error("Invalid exported state data");
    }
    
    const restored = this.restoreStateFromStorage(exportedData.state);
    
    // Validate imported state
    const errors = this.validateState(restored, restored.kind);
    if (errors.length > 0) {
      throw new Error(`Imported state validation failed: ${errors.join(", ")}`);
    }
    
    return restored;
  }
}