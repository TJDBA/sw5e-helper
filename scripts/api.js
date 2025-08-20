// scripts/api.js
import { openAttackDialog } from "./ui/AttackDialog.js";
import { openDamageDialog } from "./ui/DamageDialog.js"; // keep as-is for later
import { rollAttack } from "./core/engine/attack.js";
import { rollDamage } from "./core/engine/damage.js";
import { normalizeActor, listEquippedWeapons, getWeaponById, getItemAttackBonus } from "./core/adapter/sw5e.js";
import { setLastUsed } from "./core/services/presets.js";
import { renderAttackCard } from "./core/chat/card-renderer.js";

const MOD = "sw5e-helper";

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
  const content = renderAttackCard(state);
  const msg = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    flags: { [MOD]: { state } }
  });
  // write back messageId to flags.state and persist
  state.messageId = msg.id;
  await msg.update({ flags: { [MOD]: { state } } });
  return msg;
}

export const API = {
  async openAttack(seed = {}) {
    try {
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
      await setLastUsed(actor, "attack", sel);

      // Resolve item & freeze targets (independent of canvas selection after this point)
      const item = getWeaponById(actor, sel.weaponId);
      const frozenTargets = _freezeTargets();

      // Roll attack unless Save-Only
      let attackResult = null;
      let rolls = [];
      if (!sel.saveOnly) {
        attackResult = await rollAttack({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
        rolls = attackResult?.rolls ?? [];
      }

      // Map outcomes to frozen targets
      const targets = frozenTargets.map(ft => {
        const row = { ...ft };
        if (attackResult?.targets?.length) {
          const out = attackResult.targets.find(r => r.tokenId === ft.tokenId);
          if (out) row.attack = { kept: out.kept, total: out.total, status: out.status };
        }
        // Pre-seed save block if provided by dialog
        if (sel?.save) {
          const dcRaw = sel.save.dc ?? sel.save.dcFormula;
          row.save = { abi: sel.save.ability, dc: Number(dcRaw) || dcRaw };
        }
        return row;
      });

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
        options: {
          separate: !!sel.separate,
          adv: sel.adv ?? "normal",
          saveOnly: !!sel.saveOnly,
          ...(sel.save ? { save: { ability: sel.save.ability, dc: Number(sel.save.dc ?? sel.save.dcFormula) || sel.save.dcFormula } } : {}),
          smart: !!sel.smart,
          smartAbility: Number(sel.smartAbility ?? 0),
          smartProf: Number(sel.smartProf ?? 0),
          itemAttackBonus: getItemAttackBonus(actor, item) || 0
        },
        targets
      };

      // Create the card message (single, updateable)
      await _createAttackCardMessage({ actor, state, rolls });
      return state; // for chaining/tests if needed
    } catch (e) {
      console.error("SW5E Helper (API) openAttack error", e);
      ui.notifications.error("SW5E Helper: could not open Attack (see console).");
    }
  },

  async openDamage(seed = {}) {
    // unchanged for now
    const actor = seed.actor ?? canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
    if (!actor) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor"));
    const weapons = listEquippedWeapons(actor);
    const sel = await openDamageDialog({ actor, weapons });
    if (!sel) return;
    await setLastUsed(actor, "damage", sel);
    return rollDamage({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
  }
};
