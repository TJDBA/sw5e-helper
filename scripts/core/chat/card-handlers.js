// scripts/core/chat/card-handlers.js
const MOD = "sw5e-helper";
import { renderAttackCard } from "./card-renderer.js";

/** helpers */
function _getState(msg){ return foundry.utils.getProperty(msg, `flags.${MOD}.state`); }
function _setState(msg,state){ return msg.update({ flags:{ [MOD]:{ state }}, content: renderAttackCard(state) }); }
function _appendRolls(msg, newRolls){
  const rolls = Array.isArray(msg.rolls) ? msg.rolls.slice() : [];
  for (const r of newRolls) if (r) rolls.push(r);
  return msg.update({ rolls });
}
function _resolveRef(ref){
  const [sceneId, tokenId] = (ref||"").split(":");
  const scene = game.scenes.get(sceneId);
  const token = scene?.tokens?.get(tokenId);
  const actor = token?.actor ?? null;
  return { scene, token, actor };
}
function _isOwner(actor){ return !!actor?.isOwner; }
function _userCanRow(actor){ return game.user.isGM || _isOwner(actor); }

/** compute save DC from state.options.save, with @mod/@prof + itemAttackBonus */
async function _computeSaveDC(state, abi){
  const opt = state.options ?? {};
  const base = opt.save?.dc ?? opt.save?.dcFormula ?? 0;
  const useSmart = !!opt.smart;
  const mod  = useSmart ? Number(opt.smartAbility||0) : Number(foundry.utils.getProperty(game.actors.get(state.actorId), `system.abilities.${abi}.mod`) || 0);
  const prof = useSmart ? Number(opt.smartProf||0)    : Number(foundry.utils.getProperty(game.actors.get(state.actorId), "system.attributes.prof") || 0);
  const itemBonus = Number(opt.itemAttackBonus||0);

  if (typeof base === "number") return base + itemBonus;

  const formula = String(base).replace(/@mod\b/gi, String(mod)).replace(/@prof\b/gi, String(prof));
  const roll = await (new Roll(formula)).evaluate({async:true});
  return (roll.total ?? 0) + itemBonus;
}

/** roll one save (normal, no adv/dis) using system if available; fallback to raw */
async function _rollSave(actor, abi){
  if (actor?.rollAbilitySave) {
    const res = await actor.rollAbilitySave(abi, { fastForward:true, chatMessage:false });
    return res?.roll ?? res; // dnd5e/swx returns {roll}
  }
  const mod = Number(foundry.utils.getProperty(actor, `system.abilities.${abi}.save`) ??
                     foundry.utils.getProperty(actor, `system.abilities.${abi}.mod`) ?? 0);
  return await (new Roll(`1d20 + ${mod}`)).evaluate({async:true});
}

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
      const {scene, token, actor} = _resolveRef(el.dataset.targetRef);
      if (token?.object) {
        canvas.ping(token.object.center, { scene });
        if (game.user.isGM || _isOwner(actor)) token.object.control({ releaseOthers:true });
      }
      return;
    }

    // === SAVES ===

    // Single-row save
    if (action === "roll-save") {
      const ref = el.dataset.targetRef;
      const { actor } = _resolveRef(ref);
      if (!actor) return ui.notifications.warn("SW5E Helper: Target not found.");
      if (!_userCanRow(actor)) return ui.notifications.warn("SW5E Helper: You lack permission for that target.");

      // find target row
      const i = (state.targets||[]).findIndex(t => `${t.sceneId}:${t.tokenId}` === ref);
      if (i < 0) return;

      const abi = (state.targets[i].save?.abi ?? state.options?.save?.ability ?? "dex").toLowerCase();
      const dc  = await _computeSaveDC(state, abi);
      const roll = await _rollSave(actor, abi);
      const total = roll?.total ?? 0;

      // Dice So Nice (manual, since we're updating an existing message)
      try { await game.dice3d?.showForRoll?.(roll, game.user, true); } catch(e) {}

      // record on row
      state.targets[i].save = { abi, dc, total, success: total >= dc };
      await _appendRolls(message, [roll]);
      await _setState(message, state);
      return;
    }

    // GM: roll all remaining saves
    if (action === "gm-roll-all-saves") {
      if (!game.user.isGM) return ui.notifications.warn("SW5E Helper: GM only.");
      const tlist = state.targets || [];
      const newRolls = [];
      for (let i=0; i<tlist.length; i++) {
        const t = tlist[i];
        // skip rows with a result already
        if (t.save?.total != null) continue;

        const { actor } = _resolveRef(`${t.sceneId}:${t.tokenId}`);
        if (!actor) continue;

        const abi = (t.save?.abi ?? state.options?.save?.ability ?? "dex").toLowerCase();
        const dc  = await _computeSaveDC(state, abi);
        const roll = await _rollSave(actor, abi);
        const total = roll?.total ?? 0;

        try { await game.dice3d?.showForRoll?.(roll, game.user, true); } catch(e) {}

        t.save = { abi, dc, total, success: total >= dc };
        newRolls.push(roll);
      }
      if (newRolls.length) await _appendRolls(message, newRolls);
      await _setState(message, state);
      return;
    }

    // === PLACEHOLDERS (next step) ===
    const notYet = new Set([
      "card-quick-damage","card-mod-damage",
      "gm-apply-all-full","row-mod-damage","apply-full","apply-half","apply-none",
      "show-attack-formula","show-damage-formula"
    ]);
    if (notYet.has(action)) {
      ui.notifications.info("SW5E Helper: Damage/apply actions coming next.");
    }
  }, { capture:true });
});
