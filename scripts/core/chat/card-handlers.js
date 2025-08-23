// scripts/core/chat/card-handlers.js
// Simplified single delegated handler for attack cards

import { renderAttackCard } from "./card-renderer.js";
import { rollDamageForTargets } from "../engine/damage.js";
import { DamageDialog } from "../../ui/DamageDialog.js";
import { applyDamage } from "../engine/apply-damage.js";

/* ----------------------------- bootstrap ----------------------------- */

Hooks.on("renderChatMessage", (message, html) => {
  const root = html[0]?.querySelector?.(".sw5e-helper-card");
  if (!root) return;
  root.addEventListener("click", (ev) => _onCardClick(ev, message));
});

/* ------------------------------ main handler ----------------------------- */

async function _onCardClick(ev, message) {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  ev.preventDefault();
  ev.stopPropagation();

  const action = el.dataset.action;
  const state = message?.flags?.["sw5e-helper"]?.state;
  if (!state) return;

  const ref = el.dataset.targetRef || el.closest(".target-row")?.dataset?.targetRef || null;
  const target = ref ? _rowByRef(state, ref) : null;

  console.log("SW5E DEBUG: Card action", { action, ref });

  /* ---------------------------- action handlers --------------------------- */

  // UI Controls
  if (action === "toggle-all") {
    state.ui = state.ui || {};
    state.ui.expandedAll = !state.ui.expandedAll;
    return _update(message, state);
  }

  // Token interactions
  if (action === "ping-token") return _pingToken(ref);
  if (action === "select-token") return _selectToken(ref);

  // Info tooltips
  if (action === "show-attack-formula") {
    if (state.attack?.info) ui.notifications.info(state.attack.info);
    return;
  }
  if (action === "show-damage-formula") {
    if (target?.damage?.info) ui.notifications.info(target.damage.info);
    return;
  }

  // Save rolling
  if (action === "roll-save") {
    if (!target?.save || target.missing) return;
    await _rollSave(message, state, target, ref);
    return;
  }
  if (action === "gm-roll-all-saves") {
    if (!game.user.isGM) return;
    await _rollAllSaves(message, state);
    return;
  }

  // Damage rolling
  if (action === "card-quick-damage" || action === "gm-roll-damage") {
    await _rollQuickDamage(message, state);
    return;
  }
  if (action === "card-mod-damage") {
    await _rollModDamage(message, state);
    return;
  }
  if (action === "row-mod-damage") {
    if (!target || target.missing) return;
    await _rollRowDamage(message, state, target, ref, el);
    return;
  }

  // Damage application
  if (action === "apply-full" || action === "apply-half" || action === "apply-none") {
    if (!target?.damage || target.missing) return;
    await _applyDamage(message, state, target, action.replace("apply-", ""));
    return;
  }
  if (action === "gm-apply-all-full") {
    if (!game.user.isGM) return;
    await _applyAllDamage(message, state);
    return;
  }
}

/* ---------------------------- action implementations --------------------------- */

async function _rollSave(message, state, target, ref) {
  const actor = game.actors.get(target.actorId || state.actorId);
  if (!actor) return;

  const abilityKey = target.save?.ability?.toLowerCase() || "flat";
  const totalMod = actor.system?.abilities?.[abilityKey]?.save ?? 0;
  
  if (abilityKey = "flat") totalMod = 0;

  const roll = new Roll(`1d20+${totalMod}`);
  await roll.evaluate({ async: true });
  
  try { game.dice3d?.showForRoll?.(roll, game.user, true); } catch (_) {}

  const dc = Number(target.save?.dc ?? Infinity);
  const d20 = roll.terms?.find?.(t => t.faces === 20)?.results?.[0]?.result;
  let outcome = roll.total >= dc ? "success" : "fail";
  //if (d20 === 20) outcome = "critical";
  //if (d20 === 1) outcome = "fumble";

  target.save.roll = { total: roll.total, formula: roll.formula, outcome };
  await _appendRolls(message, [roll]);
  return _update(message, state);
}

async function _rollAllSaves(message, state) {
  const rows = (state.targets || []).filter(t => t.save && !t.save.roll && !t.missing);
  if (!rows.length) return;

  for (const target of rows) {
    const ref = `${target.sceneId}:${target.tokenId}`;
    await _rollSave(message, state, target, ref);
  }
}

async function _rollQuickDamage(message, state) {
  const eligible = _eligibleDamageRows(state);
  if (!eligible.length) return;

  const actor = game.actors.get(state.actorId);
  const item = actor?.items.get(state.itemId);
  if (!actor || !item) return;

  const targetRefs = eligible.map(t => `${t.sceneId}:${t.tokenId}`);
  const critMap = Object.fromEntries(eligible.map(t => [
    `${t.sceneId}:${t.tokenId}`,
    String(t?.summary?.status) === "crit"
  ]));

  const { perTargetTotals, perTargetTypes, rolls, info } = await rollDamageForTargets({
    actor, item,
    dmgState: state.options || {},
    targetRefs, critMap,
    separate: !!state.options?.separate
  });

  // Update targets with damage results
  for (const t of eligible) {
    const ref = `${t.sceneId}:${t.tokenId}`;
    const total = perTargetTotals.get(ref);
    if (total != null) {
      t.damage = { total, types: perTargetTypes.get(ref) || { kinetic: total }, info };
    }
  }

  if (rolls?.length) await _appendRolls(message, rolls);
  return _update(message, state);
}

async function _rollModDamage(message, state) {
  const eligible = _eligibleDamageRows(state);
  if (!eligible.length) return;
  await _openDamageDialog(message, state, eligible, { separate: !!state.options?.separate });
}

async function _rollRowDamage(message, state, target, ref, button) {
  // Prevent multiple clicks
  button.style.pointerEvents = 'none';
  button.style.opacity = '0.5';
  
  try {
    await _openDamageDialog(message, state, [target], { separate: true, targetRef: ref });
  } finally {
    button.style.pointerEvents = '';
    button.style.opacity = '';
  }
}

async function _applyDamage(message, state, target, mode) {
  const actor = _resolveTargetActor(target, state);
  if (!actor) return;

  const result = await applyDamage(actor, target.damage.types, mode);
  
  target.damage.applied = mode;
  target.damage.appliedAmount = result.totalDamageApplied;
  target.damage.appliedResult = result; // Store full result for rollback
  
  return _update(message, state);
}

async function _applyAllDamage(message, state) {
  const rows = (state.targets || []).filter(t => 
    t.damage && t.damage.total != null && !t.damage.applied && !t.missing
  );
  
  for (const target of rows) {
    const actor = _resolveTargetActor(target, state);
    if (!actor) continue;

    const result = await applyDamage(actor, target.damage.types, "full");
    target.damage.applied = "full";
    target.damage.appliedAmount = result.totalDamageApplied;
    target.damage.appliedResult = result;
  }
  
  return _update(message, state);
}

async function _openDamageDialog(message, state, targets, options = {}) {
  const actor = game.actors.get(state.actorId);
  const item = actor?.items.get(state.itemId);
  if (!actor || !item) return;

  const hasCrit = targets.some(t => String(t?.summary?.status) === "crit");
  const seed = {
    weaponId: state.itemId,
    ability: state.options?.smart ? "manual" : "",
    offhand: !!state.options?.offhand,
    smart: !!state.options?.smart,
    smartAbility: state.options?.smartAbility || 0,
    separate: !!options.separate,
    isCrit: hasCrit && !options.separate,
    extraRows: []
  };

  const dialog = new DamageDialog({ 
    actor, item, seed,
    scope: options.targetRef ? { type: "row", ref: options.targetRef } : { type: "card" }
  });
  
  dialog.render(true);
  const result = await dialog.wait();
  
  if (result) {
    const targetRefs = targets.map(t => `${t.sceneId}:${t.tokenId}`);
    const critMap = Object.fromEntries(targets.map(t => [
      `${t.sceneId}:${t.tokenId}`,
      String(t?.summary?.status) === "crit" || (!!result.isCrit && !options.targetRef)
    ]));

    const { perTargetTotals, perTargetTypes, rolls, info } = await rollDamageForTargets({
      actor, item, dmgState: result, targetRefs, critMap, separate: !!result.separate
    });

    // Update targets
    for (const t of targets) {
      const ref = `${t.sceneId}:${t.tokenId}`;
      const total = perTargetTotals.get(ref);
      if (total != null) {
        t.damage = { total, types: perTargetTypes.get(ref) || { kinetic: total }, info };
      }
    }

    if (rolls?.length) await _appendRolls(message, rolls);
    await _update(message, state);
  }
}

/* ---------------------------- helpers --------------------------- */

function _eligibleDamageRows(state) {
  const saveOnly = !!state?.options?.saveOnly;
  const isManualDamage = !!state?.options?.manualDamage;
  
  return (state.targets || []).filter(t => {
    if (t.missing) return false;
    if (t.damage && t.damage.applied) return false; // Already applied
    if (saveOnly || isManualDamage) return true;
    return ["hit", "crit", "manual-damage"].includes(String(t?.summary?.status || ""));
  });
}

function _rowByRef(state, ref) {
  if (!ref) return null;
  return (state.targets || []).find(t => `${t.sceneId}:${t.tokenId}` === ref) || null;
}

function _resolveTargetActor(target, state) {
  return game.actors.get(target.actorId || state.actorId);
}

async function _update(message, state, rolls = []) {
  const payload = {
    content: renderAttackCard(state),
    flags: { "sw5e-helper": { state } }
  };
  if (rolls.length) payload.rolls = [...(message.rolls || []), ...rolls];
  return message.update(payload);
}

async function _appendRolls(message, rolls) {
  if (!rolls?.length) return;
  return message.update({ rolls: [...(message.rolls || []), ...rolls] });
}

function _pingToken(ref) {
  if (!ref) return;
  const [sceneId, tokenId] = ref.split(":");
  const scene = game.scenes?.get(sceneId) || canvas?.scene;
  const token = scene?.tokens?.get(tokenId);
  if (token?.object && canvas?.ping) canvas.ping(token.object.center, { scene });
}

function _selectToken(ref) {
  if (!ref) return;
  const [sceneId, tokenId] = ref.split(":");
  const scene = game.scenes?.get(sceneId) || canvas?.scene;
  const token = scene?.tokens?.get(tokenId);
  if (token?.object) token.object.control({ releaseOthers: true });
}

export { }