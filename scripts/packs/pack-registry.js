// scripts/core/packs/pack-registry.js
// SW5E Helper - Pack Registry System
// Central registry for pack-contributed features with dynamic HTML rendering

// scripts/packs/pack-registry.js
import { ConfigHelper, SW5E_CONFIG } from "../core/config.js";

export class PackRegistry {
  static packs = new Map();
  static _initialized = false;

  /**
   * Register a new pack with the system
   * @param {Object} pack - The pack definition object
   */
  static register(pack) {
    if (!pack.id) {
      console.error("SW5E Helper: Pack registration failed - missing id", pack);
      return;
    }

    if (this.packs.has(pack.id)) {
      console.warn(`SW5E Helper: Pack '${pack.id}' is already registered, overwriting`);
    }

    // Validate required pack properties
    if (!this.validatePack(pack)) {
      console.error(`SW5E Helper: Pack '${pack.id}' failed validation`, pack);
      return;
    }

    this.packs.set(pack.id, pack);
    ConfigHelper.debug("packs", `Registered pack: ${pack.id}`, { name: pack.name });
  }

  /**
   * Validate a pack definition
   * @param {Object} pack - Pack to validate
   * @returns {boolean} True if valid
   */
  static validatePack(pack) {
    const required = ["id", "name", "available"];
    for (const field of required) {
      if (!pack[field]) {
        console.error(`SW5E Helper: Pack missing required field '${field}'`);
        return false;
      }
    }

    if (typeof pack.available !== "function") {
      console.error("SW5E Helper: Pack 'available' must be a function");
      return false;
    }

    return true;
  }

  /**
   * Get all packs available for the given context
   * @param {Actor} actor - The actor 
   * @param {Item} weapon - The weapon item
   * @param {Object} context - Additional context (type, state, etc.)
   * @returns {Array} Available pack objects
   */
  static getAvailablePacks(actor, weapon, context) {
    ConfigHelper.debug("packs", "Getting available packs", { 
      actor: actor?.name, 
      weapon: weapon?.name, 
      context 
    });

    return Array.from(this.packs.values()).filter(pack => {
      try {
        // Check basic availability first
        if (!pack.available(actor, weapon, context)) {
          return false;
        }

        // Simple ID-based feature checking
        if (!this.hasRequiredFeatures(actor, pack)) {
          ConfigHelper.debug("packs", `Pack '${pack.id}' failed feature requirements`);
          return false;
        }

        return true;
      } catch (error) {
        console.error(`SW5E Helper: Error checking pack '${pack.id}' availability`, error);
        return false;
      }
    });
  }

  /**
   * Check if actor has required features for a pack (simplified ID-based)
   * @param {Actor} actor - The actor
   * @param {Object} pack - The pack definition  
   * @returns {boolean} True if requirements met
   */
  static hasRequiredFeatures(actor, pack) {
    if (!pack.requiredFeatureIds || pack.requiredFeatureIds.length === 0) {
      return true;
    }

    ConfigHelper.debug("packs", `Checking feature requirements for pack '${pack.id}'`, {
      requirements: pack.requiredFeatureIds,
      actorFeatures: actor.items.map(i => ({ name: i.name, id: i.system?.identifier }))
    });

    return pack.requiredFeatureIds.every(featureId => {
      // Check by identifier first, then by name matching
      const found = actor.items.some(item => 
        item.system?.identifier === featureId ||
        this.featureNameMatches(item, featureId)
      );
      
      if (!found) {
        ConfigHelper.debug("packs", `Missing required feature: ${featureId}`);
      }
      return found;
    });
  }

  /**
   * Check if an item name matches a feature ID (flexible matching)
   * @param {Item} item - Actor item to check
   * @param {string} featureId - Feature ID to match
   * @returns {boolean} True if item matches feature
   */
  static featureNameMatches(item, featureId) {
    if (!item.name) return false;
    
    const itemName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const searchId = featureId.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Direct match
    if (itemName === searchId) return true;
    
    // Common variations
    const variations = {
      'combatsuperiority': ['superioritydice', 'battlemaster'],
      'forceempoweredstrikes': ['forceempowered', 'empoweredstrikes'],
      'auraofhatred': ['hatred', 'aura']
    };
    
    if (variations[searchId]) {
      return variations[searchId].some(variant => itemName.includes(variant));
    }
    
    // Contains match (be careful with this)
    return itemName.includes(searchId) || searchId.includes(itemName);
  }

  /**
   * Render attack features HTML from all available packs
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   * @param {Object} context - Context including current state
   * @returns {string} Combined HTML from all packs
   */
  static renderAttackFeatures(actor, weapon, context) {
    const availablePacks = this.getAvailablePacks(actor, weapon, { 
      ...context, 
      type: 'attack' 
    });

    let html = '';
    
    for (const pack of availablePacks) {
      if (pack.renderAttackHTML && typeof pack.renderAttackHTML === "function") {
        try {
          const packHTML = pack.renderAttackHTML(actor, weapon, context);
          if (packHTML && typeof packHTML === "string") {
            html += packHTML;
          }
        } catch (error) {
          console.error(`SW5E Helper: Error rendering attack HTML for pack '${pack.id}'`, error);
        }
      }
    }

    ConfigHelper.debug("packs", "Rendered attack features", { 
      packsCount: availablePacks.length,
      htmlLength: html.length 
    });

    return html;
  }

  /**
   * Render damage features HTML from all available packs  
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   * @param {Object} context - Context including current state
   * @returns {string} Combined HTML from all packs
   */
  static renderDamageFeatures(actor, weapon, context) {
    const availablePacks = this.getAvailablePacks(actor, weapon, { 
      ...context, 
      type: 'damage' 
    });

    let html = '';
    
    for (const pack of availablePacks) {
      if (pack.renderDamageHTML && typeof pack.renderDamageHTML === "function") {
        try {
          const packHTML = pack.renderDamageHTML(actor, weapon, context);
          if (packHTML && typeof packHTML === "string") {
            html += packHTML;
          }
        } catch (error) {
          console.error(`SW5E Helper: Error rendering damage HTML for pack '${pack.id}'`, error);
        }
      }
    }

    ConfigHelper.debug("packs", "Rendered damage features", { 
      packsCount: availablePacks.length,
      htmlLength: html.length 
    });

    return html;
  }

  /**
   * Validate pack state from form submission
   * @param {Object} packState - State object with pack data
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   * @returns {Array} Array of validation errors (empty if valid)
   */
  static validatePackState(packState, actor, weapon) {
    const errors = [];

    if (!packState || typeof packState !== "object") {
      return errors; // No pack state to validate
    }

    for (const [packId, state] of Object.entries(packState)) {
      const pack = this.packs.get(packId);
      if (!pack) {
        errors.push(`Unknown pack: ${packId}`);
        continue;
      }

      if (pack.validateState && typeof pack.validateState === "function") {
        try {
          const isValid = pack.validateState(state, actor, weapon);
          if (!isValid) {
            errors.push(`Pack '${pack.name}' validation failed`);
          }
        } catch (error) {
          errors.push(`Pack '${pack.name}' validation error: ${error.message}`);
          console.error(`SW5E Helper: Pack validation error for '${packId}'`, error);
        }
      }
    }

    return errors;
  }

  /**
   * Apply pack modifications to attack data
   * @param {Object} attackData - Attack data to modify
   * @param {Object} packState - Pack state from form
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   * @returns {Object} Modified attack data
   */
  static modifyAttack(attackData, packState, actor, weapon) {
    if (!packState || typeof packState !== "object") {
      return attackData;
    }

    let modifiedData = { ...attackData };

    for (const [packId, state] of Object.entries(packState)) {
      const pack = this.packs.get(packId);
      if (!pack || !pack.modifyAttack) continue;

      try {
        modifiedData = pack.modifyAttack(modifiedData, state, actor, weapon) || modifiedData;
        ConfigHelper.debug("packs", `Applied attack modifications from pack '${packId}'`);
      } catch (error) {
        console.error(`SW5E Helper: Error applying attack modifications from pack '${packId}'`, error);
      }
    }

    return modifiedData;
  }

  /**
   * Apply pack modifications to damage data
   * @param {Object} damageData - Damage data to modify  
   * @param {Object} packState - Pack state from form
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   * @returns {Object} Modified damage data
   */
  static modifyDamage(damageData, packState, actor, weapon) {
    if (!packState || typeof packState !== "object") {
      return damageData;
    }

    let modifiedData = { ...damageData };

    for (const [packId, state] of Object.entries(packState)) {
      const pack = this.packs.get(packId);
      if (!pack || !pack.modifyDamage) continue;

      try {
        modifiedData = pack.modifyDamage(modifiedData, state, actor, weapon) || modifiedData;
        ConfigHelper.debug("packs", `Applied damage modifications from pack '${packId}'`);
      } catch (error) {
        console.error(`SW5E Helper: Error applying damage modifications from pack '${packId}'`, error);
      }
    }

    return modifiedData;
  }

  /**
   * Consume resources for all active packs
   * @param {Object} packState - Pack state from successful roll
   * @param {Actor} actor - The actor
   * @param {Item} weapon - The weapon item
   */
  static async consumeResources(packState, actor, weapon) {
    if (!packState || typeof packState !== "object") {
      return;
    }

    for (const [packId, state] of Object.entries(packState)) {
      const pack = this.packs.get(packId);
      if (!pack || !pack.consumeResources) continue;

      try {
        await pack.consumeResources(state, actor, weapon);
        ConfigHelper.debug("packs", `Consumed resources for pack '${packId}'`);
      } catch (error) {
        console.error(`SW5E Helper: Error consuming resources for pack '${packId}'`, error);
      }
    }
  }

  /**
   * Extract pack state from form data
   * @param {FormData} formData - Form data from dialog submission
   * @returns {Object} Pack state object organized by pack ID
   */
  static extractPackState(formData) {
    const packState = {};

    for (const [key, value] of formData.entries()) {
      if (key.startsWith("pack.")) {
        const parts = key.split(".");
        if (parts.length >= 3) {
          const packId = parts[1];
          const fieldName = parts.slice(2).join(".");

          if (!packState[packId]) {
            packState[packId] = {};
          }

          // Handle checkboxes (they only appear in FormData if checked)
          if (value === "on") {
            packState[packId][fieldName] = true;
          } else {
            packState[packId][fieldName] = value;
          }
        }
      }
    }

    // Also check for unchecked checkboxes by examining the form elements
    const form = formData.constructor.name === "FormData" ? 
      document.querySelector("form") : null;
    
    if (form) {
      const checkboxes = form.querySelectorAll('input[type="checkbox"][name^="pack."]');
      for (const checkbox of checkboxes) {
        const key = checkbox.name;
        const parts = key.split(".");
        if (parts.length >= 3) {
          const packId = parts[1];
          const fieldName = parts.slice(2).join(".");

          if (!packState[packId]) {
            packState[packId] = {};
          }

          if (!(fieldName in packState[packId])) {
            packState[packId][fieldName] = false;
          }
        }
      }
    }

    ConfigHelper.debug("packs", "Extracted pack state from form", { packState });
    return packState;
  }

  /**
   * Get summary of registered packs (for debugging)
   * @returns {Array} Array of pack summaries
   */
  static getPackSummaries() {
    return Array.from(this.packs.values()).map(pack => ({
      id: pack.id,
      name: pack.name,
      hasAttackHTML: !!pack.renderAttackHTML,
      hasDamageHTML: !!pack.renderDamageHTML,
      hasRequiredItems: !!(pack.requiredItems && pack.requiredItems.length > 0)
    }));
  }

  /**
   * Initialize the pack registry (called once during module startup)
   */
  static initialize() {
    if (this._initialized) return;

    ConfigHelper.debug("packs", "Initializing pack registry");
    this._initialized = true;

    // Expose registry on module API for external packs
    if (game.modules?.get?.(SW5E_CONFIG.MODULE.ID)) {
      const module = game.modules.get(SW5E_CONFIG.MODULE.ID);
      if (!module.api) module.api = {};
      module.api.PackRegistry = PackRegistry;
    }
  }
}