// scripts/ui/BaseDialog.js
// SW5E Helper - Base Dialog Class
// Common functionality for Attack and Damage dialogs to eliminate duplication

import { PackRegistry } from "../packs/pack-registry.js";
import { ConfigHelper, SW5E_CONFIG } from "../core/config.js";
import { 
  listPresets, getPreset, savePreset, deletePreset, 
  getLastUsed, setLastUsed 
} from "../core/services/presets.js";

export class BaseDialog extends Application {
  constructor(options = {}) {
    super();
    
    this.context = options.context;              // { actor, weapons, ... }
    this.dialogType = options.dialogType;        // "attack" | "damage"
    this._done = false;
    this._resolve = null;
    this._presets = [];

    // Set template path
    const templateKey = this.dialogType === "attack" ? "ATTACK_DIALOG" : "DAMAGE_DIALOG";
    this.options.template = ConfigHelper.getTemplatePath(templateKey);

    // Initialize state with defaults + seed overrides
    this.state = {
      ...this.getDefaultState(),
      ...(options.seed || {})
    };
  }

  /**
   * Get default state for this dialog type (override in subclasses)
   * @returns {Object} Default state object
   */
  getDefaultState() {
    return {
      weaponId: this.context?.weapons?.[0]?.id ?? "",
      presetName: "",
      adv: SW5E_CONFIG.ADV_MODES.normal,
      packState: {}
    };
  }

  /**
   * Get dialog-specific configuration (override in subclasses)
   * @returns {Object} Dialog configuration
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 520,
      height: "auto",
      resizable: true,
      classes: ["sw5e-helper-dialog"]
    });
  }

  async close(options) {
    if (!this._done) this._resolve?.(null);
    return super.close(options);
  }

  /**
   * Get data for template rendering
   * @returns {Object} Template data
   */
  async getData() {
    // Load presets
    this._presets = await listPresets(this.context.actor, this.dialogType);

    // Get selected weapon info
    const weaponsAll = this.context.weapons ?? [];
    const selected = weaponsAll.find(w => w.id === this.state.weaponId) ?? weaponsAll[0];
    const selectedId = selected?.id ?? "";
    const item = selected?.item ?? this.context.actor?.items?.get?.(selectedId);

    // Get pack-contributed HTML
    const packFeaturesHTML = PackRegistry.renderAttackFeatures(this.context.actor, item, this.state);
    const packDamageHTML = PackRegistry.renderDamageFeatures(this.context.actor, item, this.state);

    // Base data common to all dialogs
    const baseData = {
      // Weapons
      weapons: weaponsAll.map(w => ({ 
        id: w.id, 
        name: w.name, 
        selected: w.id === selectedId 
      })),
      
      // Presets filtered by weapon
      presets: (this._presets || [])
        .filter(p => p.weaponId ? p.weaponId === selectedId : true)
        .map(p => ({ 
          name: p.name, 
          selected: p.name === this.state.presetName 
        })),
      
      // Basic options
      abilities: SW5E_CONFIG.ABILITIES,
      damageTypes: SW5E_CONFIG.DAMAGE_TYPES.map(type => ({ 
        value: type, 
        label: type 
      })),
      
      // Pack integration
      packFeaturesHTML,
      packDamageHTML,
      
      // Current state
      ...this.state
    };

    // Let subclasses add their specific data
    const specificData = await this.getSpecificData(item, baseData);
    
    return { ...baseData, ...specificData };
  }

  /**
   * Get dialog-specific template data (override in subclasses)
   * @param {Item} item - Selected weapon item
   * @param {Object} baseData - Base template data
   * @returns {Object} Additional template data
   */
  async getSpecificData(item, baseData) {
    return {}; // Override in subclasses
  }

  /**
   * Common event listeners for all dialogs
   * @param {jQuery} html - Dialog HTML
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Prevent form submission
    html.on("submit", ev => { 
      ev.preventDefault(); 
      ev.stopPropagation(); 
      return false; 
    });

    const form = html.find("form")[0] ?? html[0];

    // Common button handlers
    html.find("[data-action=save]").on("click", () => this._handleSavePreset(form));
    html.find("[data-action=delete]").on("click", () => this._handleDeletePreset(form));
    html.find("[data-action=load-last]").on("click", () => this._handleLoadLast());
    html.find("[data-action=clear]").on("click", () => this._handleClear());
    html.find("[data-action=roll]").on("click", (ev) => this._handleSubmit(form, ev));
    html.find("[data-action=cancel]").on("click", (ev) => this._handleCancel(ev));

    // Preset dropdown
    html.find('select[name="presetName"]').on("change", (ev) => this._handlePresetChange(form, ev));

    // Weapon change triggers re-render
    html.find('select[name="weaponId"]').on("change", () => { 
      this._readFormState(form); 
      this.render(false); 
    });

    // Keyboard shortcuts
    html.find("form").on("keydown", ev => {
      if (ev.key === "Escape") { 
        ev.preventDefault(); 
        ev.stopPropagation(); 
        this._handleCancel(ev);
      }
      if (ev.key === "Enter") { 
        ev.preventDefault(); 
        ev.stopPropagation(); 
        html.find("[data-action=roll]")[0]?.click();
      }
    });

    // Let subclasses add their specific listeners
    this.activateSpecificListeners(html);
  }

  /**
   * Add dialog-specific event listeners (override in subclasses)
   * @param {jQuery} html - Dialog HTML
   */
  activateSpecificListeners(html) {
    // Override in subclasses
  }

  /**
   * Read current form state into this.state
   * @param {HTMLFormElement} form - Form element
   * @returns {boolean} True if read successful
   */
  _readFormState(form) {
    try {
      const formData = new FormData(form);
      
      // Extract pack state
      const packState = PackRegistry.extractPackState(formData);
      
      // Base state reading
      this.state = {
        ...this.state,
        weaponId: formData.get("weaponId") || this.state.weaponId,
        presetName: formData.get("presetName") || "",
        packState
      };

      // Let subclasses read their specific state
      this.readSpecificState(formData, form);
      
      ConfigHelper.debug("dialogs", "Read form state", { 
        dialogType: this.dialogType,
        state: this.state 
      });
      
      return true;
    } catch (error) {
      console.error("SW5E Helper: Error reading form state", error);
      return false;
    }
  }

  /**
   * Read dialog-specific state from form (override in subclasses)
   * @param {FormData} formData - Form data
   * @param {HTMLFormElement} form - Form element
   */
  readSpecificState(formData, form) {
    // Override in subclasses
  }

  /**
   * Load new state and re-render
   * @param {Object} newState - State to merge
   */
  _loadState(newState) {
    this.state = { ...this.state, ...newState };
    this.render(false);
  }

  /**
   * Validate current state before submission (override in subclasses)
   * @returns {Array} Array of validation errors (empty if valid)
   */
  validateState() {
    const errors = [];

    // Validate pack state
    const packErrors = PackRegistry.validatePackState(
      this.state.packState,
      this.context.actor,
      this.context.actor?.items?.get?.(this.state.weaponId)
    );
    errors.push(...packErrors);

    return errors;
  }

  /**
   * Build final payload for submission (override in subclasses)
   * @returns {Object} Submission payload
   */
  buildSubmissionPayload() {
    return {
      ...this.state
    };
  }

  /* ----------------------------- Event Handlers ----------------------------- */

  async _handleSavePreset(form) {
    if (!this._readFormState(form)) return;
    
    const name = await BaseDialog.promptName(
      `Save ${this.dialogType.charAt(0).toUpperCase() + this.dialogType.slice(1)} Preset`, 
      this.state.presetName || ""
    );
    if (!name) return;

    const sanitizedState = this.sanitizeStateForPreset(this.state);
    await savePreset(this.context.actor, this.dialogType, name, sanitizedState);
    
    ui.notifications.info("Preset saved.");
    this._loadState({ presetName: name });
  }

  async _handleDeletePreset(form) {
    if (!this._readFormState(form)) return;
    
    const name = this.state.presetName;
    if (!name) return ui.notifications.warn("Select a preset to delete.");
    
    await deletePreset(this.context.actor, this.dialogType, name);
    ui.notifications.info("Preset deleted.");
    this._loadState({ presetName: "" });
  }

  async _handleLoadLast() {
    const last = await getLastUsed(this.context.actor, this.dialogType);
    if (!last) return ui.notifications.warn(`No last-used ${this.dialogType} found.`);
    
    this.state = { ...this.state, ...last };
    this.render(false);
    ui.notifications.info(game.i18n.localize("SW5EHELPER.LoadedLast"));
  }

  _handleClear() {
    this._loadState(this.getDefaultState());
  }

  async _handlePresetChange(form, ev) {
    if (!this._readFormState(form)) return;
    
    const name = ev.currentTarget.value;
    if (!name) { 
      this.state.presetName = ""; 
      return; 
    }
    
    const preset = await getPreset(this.context.actor, this.dialogType, name);
    if (!preset) return ui.notifications.warn(`Preset not found: ${name}`);
    
    this._loadState({ ...preset, presetName: name });
    ui.notifications.info(`Loaded preset: ${name}`);
  }

  async _handleSubmit(form, ev) {
    ev.preventDefault();
    ev.stopPropagation();
    
    if (!this._readFormState(form)) return;

    // Validate state
    const errors = this.validateState();
    if (errors.length > 0) {
      ui.notifications.error(`Validation failed: ${errors.join(", ")}`);
      return;
    }

    // Save as last used
    try {
      await setLastUsed(this.context.actor, this.dialogType, this.sanitizeStateForPreset(this.state));
    } catch (error) {
      console.error("SW5E Helper: Error saving last used", error);
    }

    // Build and return payload
    const payload = this.buildSubmissionPayload();
    this._done = true;
    this._resolve?.(payload);
    this.close();
  }

  _handleCancel(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    this._done = true;
    this._resolve?.(null);
    this.close();
  }

  /* ----------------------------- Utilities ----------------------------- */

  /**
   * Sanitize state for preset storage (override in subclasses)
   * @param {Object} state - State to sanitize
   * @returns {Object} Sanitized state
   */
  sanitizeStateForPreset(state) {
    return {
      weaponId: state.weaponId || "",
      packState: state.packState || {}
    };
  }

  /**
   * Create a promise-based dialog
   * @returns {Promise} Promise that resolves with dialog result
   */
  wait() {
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /**
   * Prompt user for a name (static utility)
   * @param {string} title - Dialog title
   * @param {string} placeholder - Default value
   * @returns {Promise<string|null>} Entered name or null if cancelled
   */
  static async promptName(title, placeholder = "") {
    if (Dialog?.prompt) {
      return Dialog.prompt({
        title, 
        label: "Save",
        content: `<p>Name:</p><input type="text" style="width:100%" value="${placeholder}">`,
        callback: html => html.find("input").val()?.trim(),
        rejectClose: true
      });
    }

    return new Promise(resolve => {
      new Dialog({
        title,
        content: `<p>Name:</p><input type="text" style="width:100%" value="${placeholder}">`,
        buttons: {
          ok: { 
            label: "Save", 
            callback: html => resolve(html.find("input").val()?.trim()) 
          },
          cancel: { 
            label: "Cancel", 
            callback: () => resolve(null) 
          }
        },
        default: "ok",
        close: () => resolve(null)
      }).render(true);
    });
  }

  /**
   * Create and show dialog, returning a promise
   * @param {Object} options - Dialog options
   * @returns {Promise} Promise that resolves with dialog result
   */
  static async prompt(options) {
    const dialog = new this(options);
    dialog.render(true);
    return dialog.wait();
  }
}