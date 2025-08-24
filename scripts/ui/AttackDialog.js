// scripts/ui/AttackDialog.js
// SW5E Helper - Simplified Attack Dialog
// Now extends BaseDialog to eliminate duplication

import { BaseDialog } from "./BaseDialog.js";
import { ConfigHelper, SW5E_CONFIG } from "../core/config.js";
import { sanitizeAttackState } from "../core/services/presets.js";
import {
  getSaveForItem,
  parseSmartDefaults,
  getItemAttackBonus
} from "../core/adapter/sw5e.js";

export class AttackDialog extends BaseDialog {
  constructor(options = {}) {
    super({
      context: options.context,
      dialogType: "attack", 
      seed: options.seed
    });

    // Set dialog-specific options
    this.options.title = game.i18n.localize(SW5E_CONFIG.I18N_KEYS.ATTACK_TITLE);
    this.options.classes.push(SW5E_CONFIG.CSS_CLASSES.DIALOG_ATTACK);
  }

  /**
   * Get default state for attack dialog
   * @returns {Object} Default attack state
   */
  getDefaultState() {
    return {
      ...super.getDefaultState(),
      
      // Core attack options
      ability: "",
      offhand: false,
      separate: false,
      atkMods: "",
      
      // Smart weapon override
      smart: false,
      smartAbility: "",
      smartProf: "",
      
      // Saving throws
      saveOnHit: false,
      saveAbility: "",
      saveDcFormula: "",
      saveOnly: false
    };
  }

  /**
   * Get attack-specific template data
   * @param {Item} item - Selected weapon item
   * @param {Object} baseData - Base template data
   * @returns {Object} Attack-specific data
   */
  async getSpecificData(item, baseData) {
    // Attack bonus display (read-only)
    const attackBonusDisplay = item ? getItemAttackBonus(this.context.actor, item) : 0;

    // Smart weapon defaults & visibility
    const showSmart = !!item?.system?.properties?.smr;
    if (showSmart) {
      const smartDefaults = parseSmartDefaults(item);
      if (smartDefaults) {
        // Only seed blanks (don't overwrite user edits)
        if (this.state.smartAbility === "" || this.state.smartAbility === undefined) {
          this.state.smartAbility = smartDefaults.abilityMod;
        }
        if (this.state.smartProf === "" || this.state.smartProf === undefined) {
          this.state.smartProf = smartDefaults.profBonus;
        }
      }
    }

    // Saving throw prefill from item
    const itemSave = getSaveForItem(item);
    if (itemSave) {
      if (!this.state.saveAbility) this.state.saveAbility = itemSave.ability;
      if (!this.state.saveDcFormula) this.state.saveDcFormula = String(itemSave.dc);
      if (this.state.saveOnHit === undefined) this.state.saveOnHit = true;
    }

    return {
      // Smart weapon
      showSmart,
      smart: !!this.state.smart,
      smartAbility: this.state.smartAbility ?? "",
      smartProf: this.state.smartProf ?? "",
      
      // Basic options
      ability: this.state.ability,
      offhand: !!this.state.offhand,
      atkMods: this.state.atkMods ?? "",
      separate: !!this.state.separate,
      adv: this.state.adv,
      
      // Saving throws
      saveOnHit: !!this.state.saveOnHit,
      saveAbility: this.state.saveAbility ?? "",
      saveDcFormula: this.state.saveDcFormula ?? "",
      saveOnly: !!this.state.saveOnly,
      
      // Display
      attackBonusDisplay,
      
      // Features placeholder (can be extended later)
      features: this.context.features ?? []
    };
  }

  /**
   * Add attack-specific event listeners
   * @param {jQuery} html - Dialog HTML
   */
  activateSpecificListeners(html) {
    // Save checkbox mutual exclusion
    const $hit = html.find('input[name="saveOnHit"]');
    const $only = html.find('input[name="saveOnly"]');

    $hit.on("change", ev => {
      if (ev.currentTarget.checked) $only.prop("checked", false);
    });

    $only.on("change", ev => {
      if (ev.currentTarget.checked) $hit.prop("checked", false);
    });

    // Advantage mode handling
    html.find('input[name="advMode"], input[name="adv"]').on("change", ev => {
      this.state.adv = ev.currentTarget.value || SW5E_CONFIG.ADV_MODES.normal;
    });
  }

  /**
   * Read attack-specific state from form
   * @param {FormData} formData - Form data
   * @param {HTMLFormElement} form - Form element
   */
  readSpecificState(formData, form) {
    const saveOnHitChecked = !!form.querySelector('input[name="saveOnHit"]')?.checked;
    const saveOnlyChecked = !!form.querySelector('input[name="saveOnly"]')?.checked;
    
    // Mutual exclusion logic
    const saveOnHit = saveOnlyChecked ? false : saveOnHitChecked;
    const saveOnly = saveOnHitChecked ? false : saveOnlyChecked;
    
    // Read advantage mode
    const adv = 
      form.querySelector('input[name="adv"]:checked')?.value ??
      form.querySelector('input[name="advMode"]:checked')?.value ??
      this.state.adv ?? SW5E_CONFIG.ADV_MODES.normal;

    // Update state
    Object.assign(this.state, {
      adv,
      ability: (formData.get("ability") || "").trim(),
      offhand: !!form.querySelector('input[name="offhand"]')?.checked,
      atkMods: (formData.get("atkMods") || "").trim(),
      separate: !!form.querySelector('input[name="separate"]')?.checked,
      
      // Smart weapon
      smart: !!form.querySelector('input[name="smart"]')?.checked,
      smartAbility: (formData.get("smartAbility") ?? "").toString().trim(),
      smartProf: (formData.get("smartProf") ?? "").toString().trim(),
      
      // Saves
      saveOnHit,
      saveOnly,
      saveAbility: (formData.get("saveAbility") || "").toString().trim(),
      saveDcFormula: (formData.get("saveDcFormula") || "").toString().trim()
    });
  }

  /**
   * Validate attack-specific state
   * @returns {Array} Array of validation errors
   */
  validateState() {
    const errors = super.validateState();

    // Smart weapon validation
    if (this.state.smart) {
      const smartAbility = Number(this.state.smartAbility);
      const smartProf = Number(this.state.smartProf);
      
      if (!Number.isFinite(smartAbility) || !Number.isFinite(smartProf)) {
        errors.push(game.i18n.localize("SW5EHELPER.SmartValuesRequired"));
      }
    }

    // Attack modifier validation
    if (this.state.atkMods && !ConfigHelper.validateAttackModifier(this.state.atkMods)) {
      errors.push("Invalid attack modifier format");
    }

    // Save DC validation
    const hasSaveChecked = this.state.saveOnHit || this.state.saveOnly;
    if (hasSaveChecked) {
      const saveDcFormula = this.state.saveDcFormula || "";
      if (!saveDcFormula.trim()) {
        // Auto-fill default save DC if none provided
        this.state.saveDcFormula = "8 + @prof + @mod";
      }
    }

    return errors;
  }

  /**
   * Build attack submission payload
   * @returns {Object} Attack payload
   */
  buildSubmissionPayload() {
    return {
      ...sanitizeAttackState(this.state),
      
      // Pack state
      packState: this.state.packState,
      
      // Direct save flags for easier checking
      saveOnHit: !!this.state.saveOnHit,
      saveOnly: !!this.state.saveOnly,
      saveAbility: this.state.saveAbility || "",
      saveDcFormula: this.state.saveDcFormula || "",
      
      // Also include nested save object for compatibility
      save: {
        requireOnHit: !!this.state.saveOnHit,
        ability: this.state.saveAbility || "",
        dcFormula: this.state.saveDcFormula || "",
        dc: this.state.saveDcFormula || ""
      }
    };
  }

  /**
   * Sanitize attack state for preset storage
   * @param {Object} state - State to sanitize
   * @returns {Object} Sanitized state
   */
  sanitizeStateForPreset(state) {
    return {
      ...super.sanitizeStateForPreset(state),
      ...sanitizeAttackState(state),
      weaponId: state.weaponId
    };
  }
}

/**
 * Convenience function to open attack dialog
 * @param {Object} context - Dialog context
 * @returns {Promise} Dialog result
 */
export async function openAttackDialog(context) {
  return AttackDialog.prompt({ context });
}