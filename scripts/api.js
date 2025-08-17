export const API = {
  openAttackDialog: async ({ actor = canvas?.tokens?.controlled[0]?.actor } = {}) => {
    if (!actor) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.NoActor"));
    const { AttackDialog } = await import("./ui/AttackDialog.js");
    return new AttackDialog(actor).render(true);
  }
};
