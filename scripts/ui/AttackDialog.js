// scripts/ui/AttackDialog.js
import { getPresets, savePreset, deletePreset } from "../utils/presets.js";
import { executeAttack } from "../roll/attack.js";

export class AttackDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sw5e-helper-attack",
      title: game.i18n.localize("SW5EHELPER.DialogTitle"),
      template: "modules/sw5e-helper/templates/attack-dialog.hbs",
      width: 420, height: "auto", classes: ["sw5e-helper"]
    });
  }

  constructor(actor, opts = {}) {
    super(opts);
    this.actor = actor;
    this.state = {
      itemId: null,
      abilityOverride: "",
      offHand: false,
      extraMods: "",
      adv: "normal"
    };
    this._lastUsed = null; // in-memory, per-open
  }

  async getData() {
    const items = this.actor.items.filter(i => i.type === "weapon" && i.system?.equipped);
    const weapons = items.map(i => ({
      id: i.id,
      name: i.name,
      displayParts: i.system?.damage?.parts?.map(p => p[0]).join(" + "),
      selected: this.state.itemId ? this.state.itemId === i.id : false
    }));
    if (!this.state.itemId && weapons[0]) this.state.itemId = weapons[0].id;

    const abilities = ["str","dex","con","int","wis","cha"].map(k => ({
      key: k, label: k.toUpperCase(), selected: this.state.abilityOverride === k
    }));

    const presets = (await getPresets(this.actor)).map(p => ({
      name: p.name, selected: false
    }));

    return {
      presets,
      weapons,
      abilities,
      offHand: this.state.offHand,
      extraMods: this.state.extraMods,
      adv: this.state.adv
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const readForm = () => {
      const form = html[0].querySelector("form");
      const fd = new FormData(form);
      this.state.itemId = fd.get("itemId") || this.state.itemId;
      this.state.abilityOverride = fd.get("abilityOverride") || "";
      this.state.offHand = form.offHand?.checked || false;
      this.state.extraMods = (fd.get("extraMods") || "").trim();
    };

    // Field changes
    html.on("change", "select, input", () => readForm());

    // Roll-mode segmented buttons
    html.find(".row.rollmode .seg-btn").on("click", ev => {
      const mode = ev.currentTarget.dataset.adv;
      if (mode) this.state.adv = mode;
      this.render(); // re-render to flip "active" class in template (even without CSS)
    });

    // Favorites
    html.find("[data-action=save]").on("click", async () => {
      const name = await Dialog.prompt({
        title: game.i18n.localize("SW5EHELPER.Save"),
        content: `<p>${game.i18n.localize("SW5EHELPER.Favorites")} — ${game.i18n.localize("SW5EHELPER.Save")}</p>
                  <input type="text" style="width:100%" placeholder="Preset name">`,
        callback: (html) => html.querySelector("input")?.value?.trim()
      });
      if (!name) return;
      await savePreset(this.actor, {
        name,
        itemId: this.state.itemId,
        advState: this.state.adv,
        abilityOverride: this.state.abilityOverride || null,
        offHand: !!this.state.offHand,
        miscMod: 0,                 // legacy numeric, kept for compatibility
        extraMods: this.state.extraMods || "" // new free-form string
      });
      ui.notifications.info("Preset saved.");
      this.render();
    });

    html.find("[data-action=delete]").on("click", async () => {
      const name = html.find("select[name=presetName]").val();
      if (!name) return;
      await deletePreset(this.actor, name);
      ui.notifications.info("Preset deleted.");
      this.render();
    });

    // Quick presets
    html.find("[data-action=load-last]").on("click", () => {
      if (!this._lastUsed) return ui.notifications.warn("No last used settings yet.");
      this.state = { ...this.state, ...this._lastUsed };
      this.render();
    });

    html.find("[data-action=clear]").on("click", () => {
      this.state.abilityOverride = "";
      this.state.offHand = false;
      this.state.extraMods = "";
      this.state.adv = "normal";
      this.render();
    });

    // Cancel
    html.find("[data-action=cancel]").on("click", () => this.close());

    // Double-click roll-mode for quick roll (optional)
    html.find(".row.rollmode .seg-btn").on("dblclick", async () => {
      readForm();
      await this._execute();
    });

    // Enter = roll (if focused in inputs), Esc = cancel
    html.on("keydown", (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); this.close(); }
      if (ev.key === "Enter")  { ev.preventDefault(); readForm(); this._execute(); }
    });
  }

  async _execute() {
    // Remember "last used" for Quick Presets
    this._lastUsed = { ...this.state };
    await executeAttack(this.actor, this.state);
    this.close();
  }
}
