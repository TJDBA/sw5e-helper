// scripts/core/chat/card-handlers.js
// Single delegated handler for condensed attack card
// - Never creates new ChatMessages; always updates the same message
// - All state is in message.flags["sw5e-helper"].state
// - Works with renderAttackCard(state) to fully re-render the card

import { renderAttackCard } from "./card-renderer.js";
import { rollDamageForTargets } from "../../core/engine/damage.js";
import { DamageDialog } from "../../ui/DamageDialog.js";

/* ----------------------------- bootstrap ----------------------------- */

Hooks.on("renderChatMessage", (message, html) => {
  const root = html[0]?.querySelector?.(".sw5e-helper-card");
  if (!root) return;
  // attach once per message DOM
  root.addEventListener("click", (ev) => _onCardClick(ev, message));
});

/* ------------------------------ handlers ----------------------------- */

async function _onCardClick(ev, message) {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  ev.preventDefault();

  const action = el.dataset.action;
  const root   = el.closest(".sw5e-helper-card");
  const msgId  = root?.dataset?.messageId || message.id;
  if (!msgId || message.id !== msgId) ; // continue; message is correct

  const state = _getState(message);
  if (!state) return;

  // Determine target ref if any
  const ref   = el.dataset.targetRef || el.closest(".target-row")?.dataset?.targetRef || null;

  /* ------------------------------- routers ------------------------------- */

  // Expand/Collapse all
  if (action === "toggle-all") {
    state.ui = state.ui || {};
    state.ui.expandedAll = !state.ui.expandedAll;
    return _update(message, state);
  }

  // Token helpers
  if (action === "ping-token")  return _pingToken(ref);
  if (action === "select-token") return _selectToken(ref);

  // Info popovers (tooltips)
  if (action === "show-attack-formula") {
    if (state.attack?.info) ui.notifications.info(state.attack.info);
    return;
  }
  if (action === "show-damage-formula") {
    const t = _rowByRef(state, ref);
    if (t?.damage?.info) ui.notifications.info(t.damage.info);
    return;
  }

  // Per-row save
  if (action === "roll-save") {
    const t = _rowByRef(state, ref);
    if (!t?.save || t.missing) return;
    const { roll, rollObj } = await _rollSaveForTarget(t);
    t.save.roll = roll;
    await _appendRolls(message, rollObj ? [rollObj] : []);
    return _update(message, state);
  }

  // GM: roll all saves (remaining only)
  if (action === "gm-roll-all-saves") {
    if (!game.user.isGM) return;
    const rows = (state.targets || []).filter(t => t.save && !t.save.roll && !t.missing);
    if (!rows.length) return;
    const allRolls = [];
    for (const t of rows) {
      const { roll, rollObj } = await _rollSaveForTarget(t);
      t.save.roll = roll;
      if (rollObj) allRolls.push(rollObj);
    }
    if (allRolls.length) await _appendRolls(message, allRolls);
    return _update(message, state);
  }

  // Header quick damage → roll immediately without dialog
  if (action === "card-quick-damage" || action === "gm-roll-damage") {
    const eligible = _eligibleDamageRows(state);
    if (!eligible.length) return;
    await _rollAndPersistDamage(message, state, eligible, { separate: !!state?.options?.separate });
    return _update(message, state);
  }

  // Header mod damage → open dialog for all eligible targets
  if (action === "card-mod-damage") {
    const eligible = _eligibleDamageRows(state);
    if (!eligible.length) return;
    await _openDamageDialog(message, state, eligible, { separate: !!state?.options?.separate });
    return;
  }

  // Per-row mod damage → open dialog for specific target
  if (action === "row-mod-damage") {
    console.log("SW5E DEBUG: row-mod-damage clicked", { ref, action });
    const t = _rowByRef(state, ref);
    if (!t || t.missing) {
      console.log("SW5E DEBUG: No target found or target missing", { t });
      return;
    }
    console.log("SW5E DEBUG: Opening damage dialog for target", { target: t });
    await _openDamageDialog(message, state, [t], { separate: true, targetRef: ref });
    return;
  }

  // Apply damage modes
  if (action === "apply-full" || action === "apply-half" || action === "apply-none") {
    const t = _rowByRef(state, ref);
    if (!t?.damage || t.missing) return;
    const mode = action === "apply-full" ? "full" : action === "apply-half" ? "half" : "none";
    const amt  = Number(t.damage.total ?? 0);
    const applied = _applyAmount(amt, mode);
    // Placeholder for future resistances/reactions pipeline:
    // Hooks.call("sw5eHelper.preApplyDamage", { state, target:t, amount:amt, mode, types:t.damage?.types });
    t.damage.applied = mode;
    t.damage.appliedAmount = applied;
    // If you want to call system apply: try token.actor.applyDamage(applied)
    // Hooks.callAll("sw5eHelper.postApplyDamage", { state, target:t, appliedAmount:applied, mode, types:t.damage?.types });
    return _update(message, state);
  }

  // GM: apply all full for all rows with rolled damage and not yet applied
  if (action === "gm-apply-all-full") {
    if (!game.user.isGM) return;
    const rows = (state.targets || []).filter(t => t.damage && t.damage.total != null && !t.damage.applied && !t.missing);
    for (const t of rows) {
      const applied = _applyAmount(Number(t.damage.total ?? 0), "full");
      t.damage.applied = "full";
      t.damage.appliedAmount = applied;
    }
    return _update(message, state);
  }
}

/* ------------------------------ internals ------------------------------ */

function _getState(message) {
  return message?.flags?.["sw5e-helper"]?.state ?? null;
}

async function _update(message, state, rolls = []) {
  const content = renderAttackCard(state);
  const payload = {
    content,
    flags: { "sw5e-helper": { state } }
  };
  if (rolls.length) payload.rolls = [...(message.rolls || []), ...rolls];
  return message.update(payload);
}

async function _appendRolls(message, rolls) {
  if (!rolls?.length) return;
  return message.update({ rolls: [...(message.rolls || []), ...rolls] });
}

function _rowByRef(state, ref) {
  if (!ref) return null;
  return (state.targets || []).find(t => `${t.sceneId}:${t.tokenId}` === ref) || null;
}

function _refOf(t) {
  return `${t.sceneId}:${t.tokenId}`;
}

function _actorFromState(state) {
  try {
    const id = state.actorId;
    return game.actors?.get(id) || null;
  } catch { return null; }
}

function _itemFromState(state) {
  const a = _actorFromState(state);
  if (!a) return null;
  try {
    return a.items.get(state.itemId) || null;
  } catch { return null; }
}

function _applyAmount(amount, mode) {
  if (mode === "none") return 0;
  if (mode === "half") return Math.floor(Number(amount || 0) / 2);
  return Number(amount || 0);
}

function _eligibleDamageRows(state) {
  const saveOnly = !!state?.options?.saveOnly;
  const targets = state.targets || [];
  return targets.filter(t => {
    if (t.missing) return false;
    // Skip if damage already rolled
    if (t.damage && t.damage.total != null) return false;
    if (saveOnly) return true;
    const s = String(t?.summary?.status || "");
    return s === "hit" || s === "crit";
  });
}

/* -------------------------- rolling primitives ------------------------- */

async function _rollSaveForTarget(t) {
  // Build save formula - need to construct proper modifier
  const abilityKey = t.save?.ability?.toLowerCase() || "wis";
  const actor = t._actor || game.actors.get(t.actorId);
  const abilityMod = actor?.system?.abilities?.[abilityKey]?.mod ?? 0;
  
  const formula = `1d20+${abilityMod}`;
  console.log("SW5E DEBUG: Rolling save", { formula, abilityKey, abilityMod, actor: actor?.name });
  
  const r = new Roll(formula);
  await r.evaluate({ async: true });
  
  // Manually trigger DSN animation for save rolls - try without await first
  try { 
    game.dice3d?.showForRoll?.(r, game.user, true); 
    console.log("SW5E DEBUG: DSN animation triggered for save roll");
  } catch (e) {
    console.log("SW5E DEBUG: DSN animation failed for save roll", e);
  }
  
  const total = Number(r.total ?? 0);
  const dc = Number(t.save?.dc ?? Infinity);
  let outcome = total >= dc ? "success" : "fail";
  // Optional nat 20 / nat 1 check on first term if desired
  const d20 = _firstD20(r);
  if (d20 === 20) outcome = "critical";
  if (d20 === 1)  outcome = "fumble";
  
  console.log("SW5E DEBUG: Save roll result", { total, dc, outcome, d20 });
  
  return {
    roll: { total, formula: r.formula, outcome },
    rollObj: r
  };
}

function _firstD20(roll) {
  try {
    const term = roll.terms?.find?.(t => t.faces === 20 && Array.isArray(t.results));
    return term?.results?.[0]?.result ?? null;
  } catch { return null; }
}

async function _rollAndPersistDamage(message, state, rows, { separate }) {
  const actor = _actorFromState(state);
  const item  = _itemFromState(state);
  if (!actor || !item) return;

  // Build targetRefs and crit map from row status; no GM crit toggle
  const targetRefs = rows.map(_refOf);
  const critMap = {};
  for (const t of rows) critMap[_refOf(t)] = (String(t?.summary?.status) === "crit");

  // Use engine mixed-crit shared roll behavior
  const { perTargetTotals, perTargetTypes, rolls, info } = await rollDamageForTargets({
    actor, item,
    dmgState: state?.dmgState || state?.options || {},
    targetRefs, critMap,
    separate: !!separate
  });

  // Persist totals and type maps on each row
  for (const t of rows) {
    const ref = _refOf(t);
    const total = perTargetTotals.get(ref);
    if (total == null) continue;
    t.damage = t.damage || {};
    t.damage.total = total;
    t.damage.types = perTargetTypes.get(ref) || { kinetic: total }; // placeholder per-type map
    t.damage.info  = info || t.damage.info || "";
    // buttons disappear on render when total exists
  }

  if (rolls?.length) await _appendRolls(message, rolls);
}

async function _openDamageDialog(message, state, targets, options = {}) {
  const actor = _actorFromState(state);
  const item = _itemFromState(state);
  if (!actor || !item) return;

  // Determine if any target is a crit (for dialog prefill)
  // For individual target rolls, only check the specific target
  const hasCrit = options.targetRef 
    ? targets.some(t => _refOf(t) === options.targetRef && String(t?.summary?.status) === "crit")
    : targets.some(t => String(t?.summary?.status) === "crit");
  
  // Build seed data from original attack state
  const seed = {
    weaponId: state.itemId,
    ability: state.options?.smart ? "manual" : "", // Let dialog derive from weapon if not smart
    offhand: !!state.options?.offhand,
    smart: !!state.options?.smart,
    smartAbility: state.options?.smartAbility || 0,
    separate: !!options.separate,
    isCrit: hasCrit && !options.separate // For "roll all", show crit as info only
  };

  try {
    const dialog = new DamageDialog({ 
      actor, 
      item, 
      seed,
      scope: options.targetRef ? { type: "row", ref: options.targetRef } : { type: "card" }
    });
    
    dialog.render(true);
    const result = await dialog.wait();
    
    if (result) {
      // Build crit map from target status for per-target crits
      const critMap = {};
      for (const t of targets) {
        const ref = _refOf(t);
        // For individual target rolls, only use the target's actual status
        // For group rolls, use dialog crit setting as fallback
        if (options.targetRef) {
          // Individual target: only use target's actual crit status
          critMap[ref] = (String(t?.summary?.status) === "crit");
        } else {
          // Group roll: use target status or dialog crit setting
          critMap[ref] = (String(t?.summary?.status) === "crit") || !!result.isCrit;
        }
      }
      
      // Roll damage with dialog settings
      const targetRefs = targets.map(_refOf);
      console.log("SW5E DEBUG: Calling rollDamageForTargets", { 
        targetRefs, 
        critMap, 
        separate: !!result.separate,
        dmgState: result,
        isIndividualTarget: !!options.targetRef
      });
      
      const { perTargetTotals, perTargetTypes, rolls, info } = await rollDamageForTargets({
        actor, item,
        dmgState: result, // Use dialog result as damage state
        targetRefs, critMap,
        separate: !!result.separate
      });
      
      console.log("SW5E DEBUG: rollDamageForTargets returned", { 
        perTargetTotals, 
        perTargetTypes, 
        rolls: rolls?.length, 
        info 
      });

      // Apply results to targets
      for (const t of targets) {
        const ref = _refOf(t);
        const total = perTargetTotals.get(ref);
        if (total == null) continue;
        t.damage = t.damage || {};
        t.damage.total = total;
        t.damage.types = perTargetTypes.get(ref) || { kinetic: total };
        t.damage.info = info || t.damage.info || "";
      }

      if (rolls?.length) await _appendRolls(message, rolls);
      await _update(message, state);
    }
  } catch (e) {
    console.error("SW5E Helper: Damage dialog error", e);
  }
}

/* ----------------------------- token helpers --------------------------- */

function _resolveSceneAndToken(ref) {
  if (!ref) return {};
  const [sceneId, tokenId] = ref.split(":");
  const scene = game.scenes?.get(sceneId) || canvas?.scene;
  const token = scene?.tokens?.get(tokenId);
  return { scene, token };
}

function _pingToken(ref) {
  const { scene, token } = _resolveSceneAndToken(ref);
  if (token?.object && canvas?.ping) canvas.ping(token.object.center, { scene });
}

function _selectToken(ref) {
  const { scene, token } = _resolveSceneAndToken(ref);
  if (token?.object) token.object.control({ releaseOthers: true });
}

/* -------------------------------- exports ------------------------------ */

export { }
