// scripts/ui/DamageDialog.js
// SW5E Helper - Simplified Damage Dialog
// Now extends BaseDialog to eliminate duplication and add pack integration

import { BaseDialog } from "./BaseDialog.js";
import { ConfigHelper, SW5E_CONFIG } from "../core/config.js";
import { sanitizeDamageState } from "../core/services/presets.js";

export class DamageDialog extends BaseDialog {
  constructor(options = {}) {
    const { actor, item, weapons, seed, scope } = options;
    
    super({
      context: { actor, item, weapons },
      dialogType: "damage",
      seed
    });

    this.scope = scope || { type: "manual" };
    
    // Set dialog-specific options
    this.options.title = game.i18n.localize(SW5E_CONFIG.I18N_KEYS.DAMAGE_TITLE);
    this.options.classes.push(SW5E_CONFIG.CSS_CLASSES.DIALOG_DAMAGE);
    this.options.width = 560;
    
    // Also resolve when callers pass an ID (or when only seed.weaponId is set)
    if (!this.context.item) {
      const idLike =
        (options?.item && (typeof options.item === "string" || typeof options.item === "number")
          ? String(options.item)
          : null)
        ?? (this.state?.weaponId ? String(this.state.weaponId) : null);
      if (idLike) {
        this.context.item =
          actor?.items?.get?.(idLike) ??
          game.items?.get?.(idLike) ??
          null;
      }
    }
  }

  /**
   * Get default state for damage dialog
   * @returns {Object} Default damage state
   */
  getDefaultState() {
    return {
      ...super.getDefaultState(),
      
      // Core damage options
      ability: "",
      offhand: false,
      smart: false,
      smartAbility: 0,
      separate: false,
      isCrit: false,
      
      // Extra damage modifiers
      extraRows: [],
      
      // Damage options
      useMinDie: false,
      
      // Once-per-turn toggles
      otpDamageAdv: false,
      otpDamageDis: false
    };
  }

  /**
   * Get damage-specific template data
   * @param {Item} item - Selected weapon item
   * @param {Object} baseData - Base template data
   * @returns {Object} Damage-specific data
   */
  async getSpecificData(item, baseData) {
    if (!item) {
      throw new Error("DamageDialog requires a valid weapon Item.");
    }

    // Parse weapon damage parts
    const sys = item.system ?? {};
    const parts = Array.isArray(sys.damage?.parts) ? sys.damage.parts : [];
    const weaponDamageParts = parts.map(([formula, type], idx) => ({
      formula: String(formula || "0"),
      typeLabel: String(type || ""),
      isBase: idx === 0
    }));

    // Smart weapon info
    const showSmart = !!sys.properties?.smr;
    
    // Brutal weapon info
    const brutalVal = Number(sys.properties?.brutal ?? 0) || 0;
    const showBrutal = brutalVal > 0;
    const baseFaces = this._getFirstDieFaces(weaponDamageParts[0]?.formula);
    const brutalDamType = weaponDamageParts[0]?.type;

    // Weapon locking (for card-initiated dialogs)
    const weaponLocked = this.scope?.type === "card" || this.scope?.type === "row";

    return {
      // Weapon info
      weaponLocked,
      weaponDamageParts,
      
      // Smart weapon
      showSmart,
      smart: this.state.smart,
      smartAbility: this.state.smartAbility,
      
      // Brutal weapon
      showBrutal,
      brutalXdY: showBrutal && baseFaces ? `${brutalVal}d${baseFaces}` : "",
      brutalDamType,
      
      // Basic options
      ability: this.state.ability,
      offhand: this.state.offhand,
      separate: this.state.separate,
      isCrit: this.state.isCrit,
      
      // Extra rows
      extraRows: this.state.extraRows || [],
      
      // Advanced options
      useMinDie: this.state.useMinDie,
      otpDamageAdv: this.state.otpDamageAdv,
      otpDamageDis: this.state.otpDamageDis
    };
  }

  /**
   * Add damage-specific event listeners
   * @param {jQuery} html - Dialog HTML
   */
  activateSpecificListeners(html) {
    // Add/remove extra damage rows
    html.find('[data-action="add-row"], [data-action="extra-add"]').on("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._addExtraRow(html);
    });

    html.on("click", '[data-action="del-row"], [data-action="extra-remove"], [data-action="remove-row"]', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._removeExtraRow(html, ev);
    });

    // When weapon changes in manual mode, update item and re-render
    html.find('select[name="weaponId"]').on("change", (ev) => {
      this._readFormState(html.find("form")[0]);
      if (this.scope?.type === "manual" && this.state.weaponId) {
        this.context.item = this.context.actor?.items?.get(this.state.weaponId) || this.context.item;
      }
      this.render(true);
    });
  }

  /**
   * Read damage-specific state from form
   * @param {FormData} formData - Form data
   * @param {HTMLFormElement} form - Form element
   */
  readSpecificState(formData, form) {
    // Read extra rows from DOM
    const extraRows = [];
    form.querySelectorAll(".modrow, .extra-row").forEach(row => {
      const id = row.dataset.id || row.dataset.rowid;
      if (id) {
        const formulaInput = row.querySelector(".mod-formula");
        const typeSelect = row.querySelector(".mod-type");
        const critCheckbox = row.querySelector(".mod-incrit");

        extraRows.push({
          id,
          formula: formulaInput?.value?.trim() || "",
          type: typeSelect?.value || "kinetic",
          inCrit: !!critCheckbox?.checked
        });
      }
    });

    // Update state
    Object.assign(this.state, {
      ability: (formData.get("ability") || "").trim(),
      offhand: !!form.querySelector('input[name="offhand"]')?.checked,
      smart: !!form.querySelector('input[name="smart"]')?.checked,
      smartAbility: Number(formData.get("smartAbility") ?? 0) || 0,
      separate: !!form.querySelector('input[name="separate"]')?.checked,
      isCrit: !!form.querySelector('input[name="isCrit"]')?.checked,
      
      extraRows,
      
      useMinDie: !!form.querySelector('input[name="useMinDie"]')?.checked,
      otpDamageAdv: !!form.querySelector('input[name="otpDamageAdv"]')?.checked,
      otpDamageDis: !!form.querySelector('input[name="otpDamageDis"]')?.checked
    });
  }

  /**
   * Validate damage-specific state
   * @returns {Array} Array of validation errors
   */
  validateState() {
    const errors = super.validateState();

    // Validate extra damage formulas
    for (const row of this.state.extraRows || []) {
      if (row.formula && !ConfigHelper.validateDamageFormula(row.formula)) {
        errors.push(`Invalid damage formula: ${row.formula}`);
      }
    }

    // Smart weapon validation
    if (this.state.smart) {
      const smartAbility = Number(this.state.smartAbility);
      if (!Number.isFinite(smartAbility)) {
        errors.push("Smart weapon ability modifier must be a number");
      }
    }

    return errors;
  }

  /**
   * Build damage submission payload
   * @returns {Object} Damage payload
   */
  buildSubmissionPayload() {
    return {
      ...sanitizeDamageState(this.state),
      packState: this.state.packState
    };
  }

  /**
   * Sanitize damage state for preset storage
   * @param {Object} state - State to sanitize
   * @returns {Object} Sanitized state
   */
  sanitizeStateForPreset(state) {
    return {
      ...super.sanitizeStateForPreset(state),
      ...sanitizeDamageState(state),
      weaponId: state.weaponId
    };
  }

  /* ----------------------------- Extra Row Management ----------------------------- */

  /**
   * Add a new extra damage row
   * @param {jQuery} html - Dialog HTML
   */
  _addExtraRow(html) {
    const id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    
    // Create new row HTML
    const newRowHtml = `
      <div class="modrow extra-row" data-id="${id}">
        <input type="text" class="mod-formula" placeholder="1d6" value="" />
        <select class="mod-type">
          ${SW5E_CONFIG.DAMAGE_TYPES.map(type => 
            `<option value="${type}">${type}</option>`
          ).join('')}
        </select>
        <label><input type="checkbox" class="mod-incrit" /> Include in Crit</label>
        <button type="button" data-action="remove-row" data-id="${id}" title="Remove Row">×</button>
      </div>
    `;
    
    // Find container and add row
    const container = html.find('.extra-rows-container, .extras-content, .extras .form-group, .extra-list').last();
    if (container.length) {
      container.append(newRowHtml);
    } else {
      // Fallback: add after the last modrow
      html.find('.modrow').last().after(newRowHtml);
    }
    
    // Update internal state
    this.state.extraRows = [...(this.state.extraRows || []), { 
      id, 
      formula: "", 
      type: "kinetic", 
      inCrit: false 
    }];

    ConfigHelper.debug("dialogs", "Added extra damage row", { id });
  }

  /**
   * Remove an extra damage row
   * @param {jQuery} html - Dialog HTML  
   * @param {Event} ev - Click event
   */
  _removeExtraRow(html, ev) {
    const row = ev.currentTarget.closest(".modrow, .extra-row");
    const id = row?.dataset?.id || row?.dataset?.rowid || $(ev.currentTarget).data('id');
    
    if (!id) return;
    
    // Remove from DOM
    $(row).remove();
    
    // Update internal state
    this.state.extraRows = (this.state.extraRows || []).filter(r => String(r.id) !== String(id));

    ConfigHelper.debug("dialogs", "Removed extra damage row", { id });
  }

  /* ----------------------------- Utilities ----------------------------- */

  /**
   * Get first die faces from a damage formula
   * @param {string} formula - Damage formula
   * @returns {number|null} Die faces or null
   */
  _getFirstDieFaces(formula) {
    const match = String(formula || "").match(/(\d*)d(\d+)/i);
    return match ? Number(match[2]) : null;
  }

  /**
   * Wait for dialog completion
   * @returns {Promise} Dialog result promise
   */
  async wait() {
    return super.wait();
  }
}

/**
 * Convenience function to open damage dialog
 * @param {Object} options - Dialog options
 * @returns {Promise} Dialog result
 */
export async function openDamageDialog(options) {
  const dialog = new DamageDialog(options);
  dialog.render(true);
  return await dialog.wait();
}