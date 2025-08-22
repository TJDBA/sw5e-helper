// scripts/api.js
import { openAttackDialog } from "./ui/AttackDialog.js";
import { openDamageDialog } from "./ui/DamageDialog.js"; // keep as-is for later
import { rollAttack } from "./core/engine/attack.js";
import { rollDamageForTargets } from "./core/engine/damage.js";
import { normalizeActor, listEquippedWeapons, getWeaponById, getItemAttackBonus } from "./core/adapter/sw5e.js";
import { setLastUsed } from "./core/services/presets.js";
import { renderAttackCard } from "./core/chat/card-renderer.js";

const MOD = "sw5e-helper";
const DEBUG = true; // Debug flag for console logging

// helper: freeze current targets (token list) with safe fallbacks
function _freezeTargets() {
  const list = Array.from(game.user?.targets ?? []);
  return list.map(t => ({
    sceneId: t.document?.parent?.id ?? canvas.scene?.id ?? "",
    tokenId: t.id,
    name: t.document?.name ?? t.name ?? "Target",
    img: t.document?.texture?.src ?? t.document?.texture?.src ?? t.document?.img ?? t.actor?.img ?? ""
  }));
}

// helper: create the message with flags + content
async function _createAttackCardMessage({ actor, state, rolls = [] }) {
  if (DEBUG) console.log("SW5E DEBUG: _createAttackCardMessage() called", { actor: actor.name, state, rolls });
  const content = renderAttackCard(state);
  if (DEBUG) console.log("SW5E DEBUG: Rendered card content", content);
  const msg = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    flags: { [MOD]: { state } }
  });
  // write back messageId to flags.state and persist
  state.messageId = msg.id;
  await msg.update({ flags: { [MOD]: { state } } });
  if (DEBUG) console.log("SW5E DEBUG: Chat message created and updated", { messageId: msg.id });
  return msg;
}

export const API = {
  async openAttack(seed = {}) {
    try {
      if (DEBUG) console.log("SW5E DEBUG: openAttack() started", { seed });
      const actor = seed.actor ?? canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
      if (!actor) { ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor")); return; }

      const weapons = listEquippedWeapons(actor);
      if (!weapons.length) { ui.notifications.warn("SW5E Helper: No equipped weapons."); return; }

      // (Optional) sanity check template path
      const mod = game.modules.get(MOD);
      const tpl = `${mod?.path || `modules/${MOD}`}/templates/attack-dialog.hbs`;
      await fetch(tpl).then(r => { if (!r.ok) throw new Error(`Template fetch failed: ${r.status} ${r.statusText}`); r.text(); });

      // Open dialog
      const sel = await openAttackDialog({ actor, weapons, seed });
      if (!sel) { console.debug("SW5E Helper (API) user cancelled Attack"); return; }
      if (DEBUG) console.log("SW5E DEBUG: Dialog selection", sel);
      await setLastUsed(actor, "attack", sel);

      // Resolve item & freeze targets (independent of canvas selection after this point)
      const item = getWeaponById(actor, sel.weaponId);
      const frozenTargets = _freezeTargets();
      if (DEBUG) console.log("SW5E DEBUG: Frozen targets", frozenTargets);

      // Roll attack unless Save-Only
      let attackResult = null;
      let rolls = [];
      if (!sel.saveOnly) {
        attackResult = await rollAttack({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
        rolls = attackResult?.rolls ?? [];
        if (DEBUG) console.log("SW5E DEBUG: Attack result", attackResult);
      } else {
        if (DEBUG) console.log("SW5E DEBUG: Save-only mode, skipping attack roll");
      }

      // Map outcomes to frozen targets
      const targets = await Promise.all(frozenTargets.map(async ft => {
        const row = { ...ft };
        if (attackResult?.targets?.length) {
          const out = attackResult.targets.find(r => r.tokenId === ft.tokenId);
          if (out) {
            row.attack = { kept: out.kept, total: out.total, status: out.status };
            row.summary = { 
              keptDie: out.kept, 
              attackTotal: out.total, 
              status: out.status 
            };
            if (DEBUG) console.log(`SW5E DEBUG: Mapped attack result for ${ft.name}`, { out, summary: row.summary });
          }
        } else if (sel.saveOnly) {
          // In save-only mode, set status to saveonly since no attack roll was made
          row.summary = { 
            status: "saveonly"
          };
          if (DEBUG) console.log(`SW5E DEBUG: Set saveonly status for ${ft.name}`, { summary: row.summary });
        }
        // Pre-seed save block if save checkboxes were checked
        if (sel.saveOnHit || sel.saveOnly) {
          const saveAbility = sel.saveAbility || sel.save?.ability || "cha";
          const dcRaw = sel.saveDcFormula || sel.save?.dc || sel.save?.dcFormula;
          let finalDC = dcRaw;
          let dcFormula = "";
          
          // Process DC value or use defaults
          if (typeof dcRaw === "string" && dcRaw.trim()) {
            dcFormula = dcRaw;
            try {
              // Create a roll to evaluate the formula - use the actual actor document for rollData
              const actorDoc = typeof actor.getRollData === "function" ? actor : game.actors.get(actor.id);
              const rollData = actorDoc?.getRollData?.() || {};
              const roll = new Roll(dcRaw, rollData);
              if (typeof roll.evaluate === "function") {
                await roll.evaluate({ async: true });
              } else if (typeof roll.roll === "function") {
                await roll.roll({ async: true });
              }
              finalDC = roll.total;
            } catch (e) {
              if (DEBUG) console.log("SW5E DEBUG: DC formula evaluation failed", { dcRaw, error: e });
              // Try simple number conversion
              finalDC = Number(dcRaw) || dcRaw;
            }
          } else if (typeof dcRaw === "number") {
            finalDC = dcRaw;
          } else {
            // No save DC provided, try item default or calculate 8 + prof + mod
            const itemDC = item?.system?.save?.dc;
            if (itemDC) {
              finalDC = itemDC;
            } else {
              // Default: 8 + prof + ability mod - use the actor document for proper access
              const actorDoc = typeof actor.getRollData === "function" ? actor : game.actors.get(actor.id);
              const abilityMod = actorDoc?.system?.abilities?.[saveAbility]?.mod ?? 0;
              const profBonus = actorDoc?.system?.attributes?.prof ?? 0;
              finalDC = 8 + profBonus + abilityMod;
              dcFormula = `8 + @prof + @${saveAbility}.mod`;
            }
          }
          
          row.save = { 
            ability: saveAbility, 
            dc: finalDC,
            formula: dcFormula 
          };
          
          if (DEBUG) console.log(`SW5E DEBUG: Save DC calculation for ${ft.name}`, { 
            dcRaw, finalDC, dcFormula, saveAbility, save: row.save 
          });
        }
        return row;
      }));
      
      if (DEBUG) console.log("SW5E DEBUG: Final targets array", targets);
      if (DEBUG) console.log("SW5E DEBUG: Save Checkboxes", {!!sel.saveOnHit || !!sel.saveOnly}, sel.saveOnHit, sel.saveOnly);
      // Build state for the card flags
      const state = {
        kind: "attack",
        messageId: null,
        authorId: game.user.id,
        actorId: actor.id,
        itemId: item?.id,
        weaponId: item?.id,
        itemName: item?.name,
        weaponImg: item?.img ?? item?.system?.img,
        hasSave: !!sel.saveOnHit || !!sel.saveOnly,
        options: {
          separate: !!sel.separate,
          adv: sel.adv ?? "normal",
          saveOnly: !!sel.saveOnly,
          ...(sel.save ? { save: { ability: sel.save.ability, dc: Number(sel.save.dc ?? sel.save.dcFormula) || sel.save.dcFormula } } : {}),
          smart: !!sel.smart,
          smartAbility: Number(sel.smartAbility ?? 0),
          smartProf: Number(sel.smartProf ?? 0),
          offhand: !!sel.offhand,
          itemAttackBonus: getItemAttackBonus(actor, item) || 0
        },
        targets
      };

      // Create the card message (single, updateable)
      if (DEBUG) console.log("SW5E DEBUG: Final state before card creation", state);
      await _createAttackCardMessage({ actor, state, rolls });
      if (DEBUG) console.log("SW5E DEBUG: Attack card created");
      return state; // for chaining/tests if needed
    } catch (e) {
      console.error("SW5E Helper (API) openAttack error", e);
      ui.notifications.error("SW5E Helper: could not open Attack (see console).");
    }
  },

  async openDamage(seed = {}) {
    const actor = seed.actor ?? canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
    if (!actor) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor"));

    const weapons = listEquippedWeapons(actor);
    if (!weapons.length) return ui.notifications.warn("SW5E Helper: No equipped weapons.");

    // Let the user pick weapon (unlocked manual), or honor a passed weaponId
    const cfg = await openDamageDialog({ actor, weapons, seed, scope: { type: "manual" } });
    if (!cfg) return;

    const weaponId = cfg.weaponId ?? weapons[0].id;
    const item = getWeaponById(actor, weaponId);
    if (!item) return ui.notifications.warn("SW5E Helper: Could not resolve weapon item.");

    // Use currently selected targets on the canvas (manual flow)
    const refs = Array.from(game.user.targets ?? []).map(
      t => `${t.document?.parent?.id ?? canvas.scene?.id}:${t.id}`
    );

    // Manual crit applies to all (separate/shared handled by dialog when we roll)
    const critMap = Object.fromEntries(refs.map(r => [r, !!cfg.isCrit]));

    const { perTargetTotals, rolls, singleTotal } = await rollDamageForTargets({
      actor, item, dmgState: cfg, targetRefs: refs, critMap
    });

    // Simple chat output for manual run
    const lines = refs.length
      ? Array.from(game.user.targets).map(t => {
          const ref = `${t.document?.parent?.id ?? canvas.scene?.id}:${t.id}`;
          const tot = perTargetTotals.get(ref) ?? 0;
          return `<div>${t.name}: <strong>${tot}</strong></div>`;
        })
      : [`<div>${item.name}: <strong>${singleTotal ?? 0}</strong></div>`];

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sw5e-helper-manual-damage"><div><em>${item.name}</em> — ${game.i18n.localize("SW5EHELPER.Damage")}</div>${lines.join("")}</div>`,
      rolls
    });
  }
};
