// scripts/api.js
import { openAttackDialog } from "./ui/AttackDialog.js";
import { openDamageDialog } from "./ui/DamageDialog.js"; // keep as-is for later
import { rollAttack } from "./core/engine/attack.js";
import { rollDamage } from "./core/engine/damage.js";
import { normalizeActor, listEquippedWeapons } from "./core/adapter/sw5e.js";
import { setLastUsed } from "./core/services/presets.js";

export const API = {
  async openAttack(seed = {}) {
    try {
      const actor = seed.actor ?? canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
      if (!actor) { ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor")); return; }
      const weapons = listEquippedWeapons(actor);
      console.debug("SW5E Helper (API) openAttack actor & weapons", { actor: actor.name, weapons: weapons.map(w => w.name) });

      // Ensure template is reachable before opening (useful 404 hint in console)
      const mod = game.modules.get("sw5e-helper");
      const tpl = `${mod?.path || "modules/sw5e-helper"}/templates/attack-dialog.hbs`;
      await fetch(tpl).then(r => { if (!r.ok) throw new Error(`Template fetch failed: ${r.status} ${r.statusText}`); r.text(); })
        .catch(e => { console.error("SW5E Helper (API) template fetch error:", tpl, e); throw e; });

      const sel = await openAttackDialog({ actor, weapons, seed });
      if (!sel) { console.debug("SW5E Helper (API) user cancelled Attack"); return; }
      console.debug("SW5E Helper (API) selection from dialog", sel);

      // NEW: remember last-used for this actor
      await setLastUsed(actor, "attack", sel);

      return rollAttack({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
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
    return rollDamage({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
  }
};
