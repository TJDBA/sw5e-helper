// scripts/core/config.js
// SW5E Helper - Centralized Configuration
// Externalizes all hardcoded constants for better maintainability

export const SW5E_CONFIG = {
  // Damage types used throughout the system
  DAMAGE_TYPES: [
    "kinetic", "energy", "ion", "acid", "cold", "fire", 
    "force", "lightning", "necrotic", "poison", "psychic", "sonic", "true"
  ],

  // Status classes for target rows in cards
  STATUS_CLASSES: {
    hit: "status-hit",
    miss: "status-miss",
    crit: "status-crit", 
    fumble: "status-fumble",
    saveonly: "status-saveonly",
    "manual-damage": "status-manual-damage",
    pending: "status-pending"
  },

  // Status icons displayed in cards
  STATUS_ICONS: {
    hit: "●",
    miss: "○",
    crit: "◆", 
    fumble: "○",
    saveonly: "🛡️",
    "manual-damage": "💥",
    pending: "●"
  },

  // Status text for tooltips/display
  STATUS_TEXT: {
    hit: "HIT",
    miss: "MISS",
    crit: "CRIT",
    fumble: "FUMBLE", 
    saveonly: "SAVE",
    "manual-damage": "DAMAGE",
    pending: "PENDING"
  },

  // Minimum die thresholds for die optimization
  MIN_DIE_FACES: {
    4: 2,
    6: 2, 
    8: 3,
    10: 4,
    12: 5,
    20: 8
  },

  // Dice3D color mapping for damage types
  DSN_COLORS: {
    kinetic: "#8B4513",    // brown
    energy: "#FF4500",     // orange-red
    ion: "#00BFFF",        // deep sky blue
    acid: "#32CD32",       // lime green
    cold: "#87CEEB",       // sky blue
    fire: "#DC143C",       // crimson
    force: "#9370DB",      // medium purple
    lightning: "#FFD700",  // gold
    necrotic: "#2F4F4F",   // dark slate gray
    poison: "#9ACD32",     // yellow green
    psychic: "#DA70D6",    // orchid
    sonic: "#FF69B4",      // hot pink
    true: "#FFFFFF"        // white
  },

  // Default ability scores for dropdowns
  ABILITIES: ["str", "dex", "con", "int", "wis", "cha"],

  // Advantage/disadvantage modes
  ADV_MODES: {
    adv: "adv",
    normal: "normal", 
    dis: "dis"
  },

  // Damage application modes
  DAMAGE_MODES: {
    none: "none",
    half: "half",
    full: "full"
  },

  // Card action types (for the command pattern)
  CARD_ACTIONS: {
    // UI Controls
    TOGGLE_ALL: "toggle-all",
    
    // Token interactions  
    PING_TOKEN: "ping-token",
    SELECT_TOKEN: "select-token",
    
    // Info displays
    SHOW_ATTACK_FORMULA: "show-attack-formula",
    SHOW_DAMAGE_FORMULA: "show-damage-formula",
    
    // Save rolling
    ROLL_SAVE: "roll-save", 
    GM_ROLL_ALL_SAVES: "gm-roll-all-saves",
    
    // Damage rolling
    CARD_QUICK_DAMAGE: "card-quick-damage",
    CARD_MOD_DAMAGE: "card-mod-damage", 
    ROW_MOD_DAMAGE: "row-mod-damage",
    GM_ROLL_DAMAGE: "gm-roll-damage",
    
    // Damage application
    APPLY_FULL: "apply-full",
    APPLY_HALF: "apply-half", 
    APPLY_NONE: "apply-none",
    GM_APPLY_ALL_FULL: "gm-apply-all-full"
  },

  // Dialog validation rules
  VALIDATION: {
    // Required fields for smart weapon override
    SMART_REQUIRED: ["smartAbility", "smartProf"],
    
    // Save DC validation
    SAVE_DC_MIN: 1,
    SAVE_DC_MAX: 50,
    
    // Attack modifier validation (regex)
    ATTACK_MODIFIER_PATTERN: /^[+\-]?\s*\d*d?\d*\s*([+\-]\s*\d+)*$/,
    
    // Damage formula validation
    DAMAGE_FORMULA_PATTERN: /^\s*\d*d?\d+(\s*[+\-]\s*\d+)*\s*$/
  },

  // Localization keys (for consistency)
  I18N_KEYS: {
    // Common
    NONE: "SW5EHELPER.None",
    SAVE: "SW5EHELPER.Save", 
    DELETE: "SW5EHELPER.Delete",
    CANCEL: "SW5EHELPER.Cancel",
    
    // Attack dialog
    ATTACK_TITLE: "SW5EHELPER.AttackTitle",
    WEAPON: "SW5EHELPER.Weapon",
    ATTACK_WITH: "SW5EHELPER.AttackWith",
    
    // Damage dialog  
    DAMAGE_TITLE: "SW5EHELPER.DamageTitle",
    DAMAGE: "SW5EHELPER.Damage",
    QUICK_DAMAGE: "SW5EHELPER.QuickDamage",
    
    // Card actions
    APPLY_FULL: "SW5EHELPER.ApplyFull",
    APPLY_HALF: "SW5EHELPER.ApplyHalf",
    ROLL_SAVE: "SW5EHELPER.RollSave"
  },

  // CSS classes for consistent styling
  CSS_CLASSES: {
    // Dialog classes
    DIALOG_ATTACK: "sw5e-helper-attack",
    DIALOG_DAMAGE: "sw5e-helper-damage", 
    
    // Card classes
    CARD_ROOT: "sw5e-helper-card",
    TARGET_ROW: "target-row",
    WEAPON_BANNER: "weapon-banner",
    
    // Button classes
    ICON_BTN: "icon-btn", 
    MINI_BTN: "mini-btn",
    PRIMARY_BTN: "btn primary",
    WARN_BTN: "btn warn",
    
    // State classes
    MISSING: "missing",
    APPLIED: "applied"
  },

  // Template paths
  TEMPLATES: {
    ATTACK_DIALOG: "/templates/attack-dialog.hbs",
    DAMAGE_DIALOG: "/templates/damage-dialog.hbs"
  },

  // Module metadata
  MODULE: {
    ID: "sw5e-helper",
    NAME: "SW5E Helper"
  },

  // Debug settings
  DEBUG: {
    ENABLED: true,
    LOG_ATTACKS: true,
    LOG_DAMAGE: true, 
    LOG_CARDS: true,
    LOG_PACKS: true
  }
};

// Helper functions for working with configuration
export const ConfigHelper = {
  /**
   * Get a damage type color for DSN
   * @param {string} damageType - The damage type
   * @returns {string} Hex color code
   */
  getDamageTypeColor(damageType) {
    return SW5E_CONFIG.DSN_COLORS[damageType?.toLowerCase()] || SW5E_CONFIG.DSN_COLORS.kinetic;
  },

  /**
   * Get status class for a given status
   * @param {string} status - The status string
   * @returns {string} CSS class name
   */
  getStatusClass(status) {
    return SW5E_CONFIG.STATUS_CLASSES[status] || SW5E_CONFIG.STATUS_CLASSES.pending;
  },

  /**
   * Get status icon for a given status  
   * @param {string} status - The status string
   * @returns {string} Icon character
   */
  getStatusIcon(status) {
    return SW5E_CONFIG.STATUS_ICONS[status] || SW5E_CONFIG.STATUS_ICONS.pending;
  },

  /**
   * Get status text for tooltips
   * @param {string} status - The status string  
   * @returns {string} Display text
   */
  getStatusText(status) {
    if (status === "manual-damage") return "DAMAGE";
    return SW5E_CONFIG.STATUS_TEXT[status] || SW5E_CONFIG.STATUS_TEXT.pending;
  },

  /**
   * Get minimum die value for a given die face count
   * @param {number} faces - Number of faces on the die
   * @returns {number} Minimum value
   */
  getMinDieValue(faces) {
    return SW5E_CONFIG.MIN_DIE_FACES[faces] || 1;
  },

  /**
   * Validate an attack modifier string
   * @param {string} modifier - The modifier string to validate
   * @returns {boolean} True if valid
   */
  validateAttackModifier(modifier) {
    if (!modifier || modifier.trim() === "") return true;
    return SW5E_CONFIG.VALIDATION.ATTACK_MODIFIER_PATTERN.test(modifier.trim());
  },

  /**
   * Validate a damage formula string
   * @param {string} formula - The formula string to validate  
   * @returns {boolean} True if valid
   */
  validateDamageFormula(formula) {
    if (!formula || formula.trim() === "") return true;
    return SW5E_CONFIG.VALIDATION.DAMAGE_FORMULA_PATTERN.test(formula.trim());
  },

  /**
   * Get template path for a given template name
   * @param {string} templateName - Name of the template
   * @returns {string} Full template path
   */
  getTemplatePath(templateName) {
    const moduleBase = game.modules.get(SW5E_CONFIG.MODULE.ID)?.path || `modules/${SW5E_CONFIG.MODULE.ID}`;
    const relativePath = SW5E_CONFIG.TEMPLATES[templateName];
    return relativePath ? `${moduleBase}${relativePath}` : null;
  },

  /**
   * Debug logging with module prefix
   * @param {string} category - Debug category 
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  debug(category, message, ...args) {
    if (!SW5E_CONFIG.DEBUG.ENABLED) return;
    
    const categoryEnabled = SW5E_CONFIG.DEBUG[`LOG_${category.toUpperCase()}`];
    if (categoryEnabled !== false) { // Default to enabled if not specified
      console.log(`SW5E DEBUG [${category}]: ${message}`, ...args);
    }
  }
};