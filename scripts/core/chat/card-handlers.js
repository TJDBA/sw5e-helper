// scripts/core/chat/card-handlers.js
const MOD = "sw5e-helper";
import { renderAttackCard } from "./card-renderer.js";
import { quickDamageFromState } from "../engine/damage.js";
import { resolveTokenRef, applyDamageToToken } from "../adapter/sw5e.js";

function _getState(msg){ return foundry.utils.getProperty(msg, `flags.${MOD}.state`); }
function _setState(msg,state){ return msg.update({ flags:{ [MOD]:{ state }}, content: renderAttackCard(state) }); }
function _appendRolls(msg, newRolls){
  const rolls = Array.isArray(msg.rolls) ? msg.rolls.slice() : [];
  for (const r of newRolls) if (r) rolls.push(r);
  return msg.update({ rolls });
}
function _isOwner(actor){ return !!actor?.isOwner; }
function _userCanRow(actor){ return game.user.isGM || _isOwner(actor); }
function _actorFromState(state){ return game.actors.get(state.actorId); }
function _itemFromState(state){ return _actorFromState(state)?.items?.get(state.itemId); }
function _refOf(t){ return `${t.sceneId}:${t.tokenId}`; }

Hooks.on("renderChatMessage", (message, html) => {
  const state = _getState(message);
  if (!state) return;
  const root = html[0]?.querySelector?.(".sw5e-helper-card");
  if (!root) return;

  root.addEventListener("click", async (ev) => {
    const el = ev.target.closest?.("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    // Expand/Collapse All
    if (action === "expand-all" || action === "collapse-all") {
      const open = action === "expand-all";
      root.querySelectorAll("details.target-row").forEach(d => d.open = open);
      return;
    }

    // Ping + Select
    if (action === "ping-select") {
      const ref = el.dataset.targetRef;
      const [sceneId, tokenId] = (ref || "").split(":");
      const scene = game.scenes.get(sceneId);
      const token = scene?.tokens?.get(tokenId);
      const actor = token?.actor;
      if (token?.object) {
        canvas.ping(token.object.center, { scene });
        if (game.user.isGM || _isOwner(actor)) token.object.control({ releaseOthers:true });
      }
      return;
    }

    // === SAVES (per-target + GM-all) remain as in previous step ===
    if (action === "roll-save" || action === "gm-roll-all-saves") {
      // Keep your existing save-handling code here (unchanged) …
      return;
    }

    // === QUICK DAMAGE (card header) ===
    if (action === "card-quick-damage") {
      const actor = _actorFromState(state);
      const item  = _itemFromState(state);
      if (!(game.user.isGM || state.authorId === game.user.id)) return ui.notifications.warn("SW5E Helper: Only card owner or GM.");
      if (!actor || !item) return ui.notifications.warn("SW5E Helper: Item/actor not found.");

      // Compute quick totals
      const { perTargetTotals, rolls } = await quickDamageFromState({ actor, item, state });

      // Write totals into targets (don’t overwrite applied rows)
      for (const t of (state.targets ?? [])) {
        const ref = _refOf(t);
        if (t.damage?.applied) continue;
        const total = perTargetTotals.get(ref);
        if (total != null) {
          t.damage = { ...(t.damage ?? {}), total, applied: null };
        }
      }
      if (rolls.length) await _appendRolls(message, rolls);
      await _setState(message, state);
      return;
    }

    // === APPLY (per-target) ===
    if (action === "apply-full" || action === "apply-half" || action === "apply-none") {
      const ref = el.dataset.targetRef;
      const { actor } = resolveTokenRef(ref);
      if (!actor) return ui.notifications.warn("SW5E Helper: Target not found.");
      if (!_userCanRow(actor)) return ui.notifications.warn("SW5E Helper: You lack permission for that target.");

      const idx = (state.targets || []).findIndex(t => _refOf(t) === ref);
      if (idx < 0) return;

      const row = state.targets[idx];
      const total = Number(row?.damage?.total ?? 0) || 0;
      let appliedVal = 0;
      let mode = "none";

      if (action === "apply-full")  { mode = "full"; appliedVal = await applyDamageToToken(ref, total, { half:false }); }
      if (action === "apply-half")  { mode = "half"; appliedVal = await applyDamageToToken(ref, total, { half:true  }); }
      if (action === "apply-none")  { mode = "none"; appliedVal = 0; } // no HP change

      row.damage = { ...(row.damage ?? {}), applied: { mode, value: appliedVal, by: game.user.id, at: Date.now() } };
      await _setState(message, state);
      return;
    }

    // === GM: Apply All (Full) ===
    if (action === "gm-apply-all-full") {
      if (!game.user.isGM) return ui.notifications.warn("SW5E Helper: GM only.");
      for (const t of (state.targets ?? [])) {
        if (!t?.damage?.total || t?.damage?.applied) continue;
        const ref = _refOf(t);
        const appliedVal = await applyDamageToToken(ref, Number(t.damage.total) || 0, { half:false });
        t.damage.applied = { mode: "full", value: appliedVal, by: game.user.id, at: Date.now() };
      }
      await _setState(message, state);
      return;
    }

    // === PLACEHOLDERS (mod dialog paths) ===
    const notYet = new Set(["card-mod-damage","row-mod-damage","show-attack-formula","show-damage-formula"]);
    if (notYet.has(action)) ui.notifications.info("SW5E Helper: Modified damage / breakdown coming next.");
  }, { capture: true });
});
