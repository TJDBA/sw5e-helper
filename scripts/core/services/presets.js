// scripts/core/services/presets.js
// SW5E Helper - Enhanced Preset Services with Pack State Support

const NS = "sw5e-helper";
const FLAG_PRESETS = "presets";
const FLAG_LAST = "lastUsed";

/** shape we keep in flags:
 * presets: { attack: [{name, state}], damage: [{name, state}] }
 * lastUsed: { attack: {state}, damage: {state} }
 */

async function _get(actor, key) {
  return (await actor.getFlag(NS, key)) ?? {};
}
async function _set(actor, key, val) {
  return actor.setFlag(NS, key, val);
}

function _ensureShape(store, bucket) {
  if (!store || typeof store !== "object") store = {};
  if (!store[bucket]) store[bucket] = [];
  return store;
}

function _ensureLastShape(store) {
  if (!store || typeof store !== "object") store = {};
  if (!store.attack) store.attack = null;
  if (!store.damage) store.damage = null;
  return store;
}

/** Public API */
export async function listPresets(actor, kind /* "attack" | "damage" */) {
  const store = _ensureShape(await _get(actor, FLAG_PRESETS), kind);
  return store[kind]; // [{name, state}, ...]
}

export async function getPreset(actor, kind, name) {
  const arr = await listPresets(actor, kind);
  return arr.find(p => p.name === name)?.state ?? null;
}

export async function savePreset(actor, kind, name, state) {
  const store = _ensureShape(await _get(actor, FLAG_PRESETS), kind);
  const arr = store[kind];
  const idx = arr.findIndex(p => p.name === name);
  if (idx >= 0) arr[idx] = { name, state }; else arr.push({ name, state });
  await _set(actor, FLAG_PRESETS, store);
  return true;
}

export async function deletePreset(actor, kind, name) {
  const store = _ensureShape(await _get(actor, FLAG_PRESETS), kind);
  store[kind] = store[kind].filter(p => p.name !== name);
  await _set(actor, FLAG_PRESETS, store);
  return true;
}

export async function getLastUsed(actor, kind) {
  const last = _ensureLastShape(await _get(actor, FLAG_LAST));
  return last[kind] ?? null;
}

export async function setLastUsed(actor, kind, state) {
  const last = _ensureLastShape(await _get(actor, FLAG_LAST));
  last[kind] = state;
  await _set(actor, FLAG_LAST, last);
  return true;
}

/** Keep only fields relevant to Attack presets */
export function sanitizeAttackState(state) {
  return {
    weaponId: state.weaponId || "",
    ability: state.ability || "",
    offhand: !!state.offhand,
    atkMods: state.atkMods || "",
    separate: !!state.separate,
    adv: state.adv || "normal",
    
    // Smart Weapon (persist & load)
    smart: !!state.smart,
    smartAbility: Number(state.smartAbility ?? 0),
    smartProf: Number(state.smartProf ?? 0),
    
    // Saving throws
    saveOnHit: !!state.saveOnHit,
    saveOnly: !!state.saveOnly,
    saveAbility: state.saveAbility || "",
    saveDcFormula: state.saveDcFormula || "",
    
    // Pack state (sanitized)
    packState: sanitizePackState(state.packState || {})
  };
}

export function sanitizeDamageState(state) {
  return {
    weaponId: state.weaponId || "",
    ability: state.ability || "",
    offhand: !!state.offhand,

    // Smart Weapon (damage uses only ability)
    smart: !!state.smart,
    smartAbility: Number(state.smartAbility ?? 0),

    // Extra rows
    extraRows: Array.isArray(state.extraRows)
      ? state.extraRows.map(r => ({
          id: r.id ?? crypto.randomUUID?.() ?? String(Math.random()).slice(2),
          formula: String(r.formula || "").trim(),
          type: String(r.type || "kinetic"),
          inCrit: !!r.inCrit
        }))
      : [],

    // Crit & separate
    isCrit: !!state.isCrit,
    separate: !!state.separate,

    // Adv/Dis (carried for visibility; engine applies only to eligible pool)
    adv: state.adv || "normal",

    // Min-die (per-die thresholds)
    useMinDie: !!state.useMinDie,

    // Once-per-turn toggles
    otpDamageAdv: !!state.otpDamageAdv,
    otpDamageDis: !!state.otpDamageDis,
    
    // Pack state (sanitized)
    packState: sanitizePackState(state.packState || {})
  };
}

/**
 * Sanitize pack state for storage - removes sensitive data and validates structure
 * @param {Object} packState - Raw pack state
 * @returns {Object} Sanitized pack state
 */
export function sanitizePackState(packState) {
  if (!packState || typeof packState !== "object") {
    return {};
  }

  const sanitized = {};
  
  for (const [packId, state] of Object.entries(packState)) {
    // Only include non-empty pack states
    if (!state || typeof state !== "object") continue;
    
    const packSanitized = {};
    let hasData = false;
    
    // Sanitize each field in the pack state
    for (const [key, value] of Object.entries(state)) {
      // Skip internal/private fields
      if (key.startsWith("_")) continue;
      
      // Sanitize based on value type
      if (typeof value === "boolean") {
        packSanitized[key] = value;
        hasData = true;
      } else if (typeof value === "string") {
        const cleaned = value.trim();
        if (cleaned) {
          packSanitized[key] = cleaned;
          hasData = true;
        }
      } else if (typeof value === "number" && Number.isFinite(value)) {
        packSanitized[key] = value;
        hasData = true;
      } else if (Array.isArray(value)) {
        // Sanitize arrays (for complex pack data)
        const cleanedArray = value.filter(item => item != null);
        if (cleanedArray.length > 0) {
          packSanitized[key] = cleanedArray;
          hasData = true;
        }
      }
    }
    
    // Only include pack state if it has actual data
    if (hasData) {
      sanitized[packId] = packSanitized;
    }
  }
  
  return sanitized;
}

/**
 * Migrate old preset format to new format with pack support
 * @param {Object} oldState - Old preset state
 * @param {string} kind - "attack" | "damage"
 * @returns {Object} Migrated state
 */
export function migratePresetState(oldState, kind) {
  if (!oldState || typeof oldState !== "object") {
    return {};
  }

  // If already has packState, assume it's already migrated
  if (oldState.packState) {
    return oldState;
  }

  // Apply appropriate sanitization to add missing fields
  const sanitizer = kind === "attack" ? sanitizeAttackState : sanitizeDamageState;
  return sanitizer(oldState);
}

/**
 * Validate preset state before saving
 * @param {Object} state - State to validate
 * @param {string} kind - "attack" | "damage"
 * @returns {Array} Array of validation errors (empty if valid)
 */
export function validatePresetState(state, kind) {
  const errors = [];
  
  if (!state || typeof state !== "object") {
    errors.push("Invalid state object");
    return errors;
  }
  
  // Validate weapon ID
  if (!state.weaponId) {
    errors.push("Missing weapon ID");
  }
  
  // Validate pack state if present
  if (state.packState && typeof state.packState === "object") {
    for (const [packId, packData] of Object.entries(state.packState)) {
      if (typeof packData !== "object") {
        errors.push(`Invalid pack state for ${packId}`);
      }
    }
  }
  
  // Kind-specific validation
  if (kind === "attack") {
    // Validate smart weapon state
    if (state.smart) {
      if (!Number.isFinite(state.smartAbility)) {
        errors.push("Invalid smart ability modifier");
      }
      if (!Number.isFinite(state.smartProf)) {
        errors.push("Invalid smart proficiency bonus");
      }
    }
  } else if (kind === "damage") {
    // Validate extra rows
    if (Array.isArray(state.extraRows)) {
      for (let i = 0; i < state.extraRows.length; i++) {
        const row = state.extraRows[i];
        if (!row.id) {
          errors.push(`Extra row ${i} missing ID`);
        }
        if (row.formula && typeof row.formula !== "string") {
          errors.push(`Extra row ${i} has invalid formula`);
        }
      }
    }
  }
  
  return errors;
}