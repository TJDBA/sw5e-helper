import { openAttackDialog } from "./ui/AttackDialog.js";
import { openDamageDialog } from "./ui/DamageDialog.js";
import { rollAttack } from "./core/engine/attack.js";
import { rollDamage } from "./core/engine/damage.js";
import { normalizeActor, listEquippedWeapons } from "./core/adapter/sw5e.js";

export const API = {
  async openAttack(seed = {}) {
    const actor = seed.actor ?? canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
    if (!actor) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor"));
    const weapons = listEquippedWeapons(actor);
    const sel = await openAttackDialog({ actor, weapons });
    if (!sel) return;
    return rollAttack({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
  },

  async openDamage(seed = {}) {
    const actor = seed.actor ?? canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
    if (!actor) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor"));
    const weapons = listEquippedWeapons(actor);
    const sel = await openDamageDialog({ actor, weapons });
    if (!sel) return;
    return rollDamage({ actor: normalizeActor(actor), weaponId: sel.weaponId, state: sel });
  }
};
