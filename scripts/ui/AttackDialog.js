import { getPresets, savePreset, deletePreset } from "../utils/presets.js";
import { executeAttack } from "../roll/attack.js";

export class AttackDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sw5e-helper-attack",
      title: game.i18n.localize("SW5EHELPER.DialogTitle"),
      template: "modules/sw5e-helper/templates/attack-dialog.hbs",
      width: 380, height: "auto", classes: ["sw5e-helper"]
    });
  }

  constructor(actor) {
    super();
    this.actor = actor;
    this.state = { itemId: null, adv: "normal", abilityOverride: "", offHand: false, miscMod: 0 };
  }

  async getData() {
    const weapons = this.actor.items.filter(i => i.type === "weapon" && i.system?.equipped);
    const presets = await getPresets(this.actor);
    const abilities = {
      str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA"
    };
    if (!this.state.itemId && weapons[0]) this.state.itemId = weapons[0].id;
    return { weapons, presets, abilities, ...this.state };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const $ = (sel)=>html.find(sel);

    html.on("change", "select[name=itemId], select[name=abilityOverride], input[name=offHand], input[name=miscMod], input[name=adv]", ev => {
      const form = html[0].querySelector("form");
      const fd = new FormData(form);
      this.state = {
        itemId: fd.get("itemId"),
        adv: fd.get("adv") ?? "normal",
        abilityOverride: fd.get("abilityOverride") || "",
        offHand: form.offHand.checked,
        miscMod: Number(fd.get("miscMod") || 0)
      };
    });

    $("button[data-action=load]").on("click", () => {
      const name = html.find("select[name=presetName]").val();
      const p = this.actor.getFlag("sw5e-helper", "presets")?.find(x => x.name === name);
      if (!p) return;
      this.state = { itemId: p.itemId, adv: p.advState, abilityOverride: p.abilityOverride || "", offHand: !!p.offHand, miscMod: Number(p.miscMod||0) };
      this.render();
    });

    $("button[data-action=save]").on("click", async () => {
      const name = html.find("input[name=saveName]").val()?.trim();
      if (!name) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.NameReq"));
      await savePreset(this.actor, {
        name, itemId: this.state.itemId, advState: this.state.adv,
        abilityOverride: this.state.abilityOverride || null,
        offHand: !!this.state.offHand, miscMod: Number(this.state.miscMod||0)
      });
      ui.notifications.info(game.i18n.localize("SW5EHELPER.PresetSaved"));
      this.render();
    });

    $("button[data-action=delete]").on("click", async () => {
      const name = html.find("select[name=presetName]").val();
      if (!name) return;
      await deletePreset(this.actor, name);
      ui.notifications.info(game.i18n.localize("SW5EHELPER.PresetDeleted"));
      this.render();
    });

    html.on("submit", async (ev) => {
      ev.preventDefault();
      await executeAttack(this.actor, this.state);
      this.close();
    });
  }
}
