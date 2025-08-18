// scripts/ui/DamageDialog.js
import {
  listPresets, getPreset, savePreset, deletePreset,
  getLastUsed, sanitizeDamageState
} from "../core/services/presets.js";

const MODULE_ID = "sw5e-helper";

export class DamageDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: null,
      width: 520,
      height: "auto",
      title: game.i18n.localize("SW5EHELPER.DamageTitle"),
      classes: ["sw5e-helper-damage"]
    });
  }

  constructor(context) {
    super();
    this.context = context; // { actor, weapons }
    const mod = game.modules.get(MODULE_ID);
    const base = mod?.path || `modules/${MODULE_ID}`;
    this.options.template = `${base}/templates/damage-dialog.hbs`;

    this._presets = [];
    this._done = false;
    this.state = {
      adv: "normal",
      weaponId: context.weapons?.[0]?.id ?? "",
      ability: "",
      offhand: false,
      dmgMods: "",
      separate: false,
      crit: false,
      presetName: "",
      // Smart Weapon
      smart: false,
      smartAbility: 0,
      smartProf: 0
    };
  }

  async close(options) {
    if (!this._done) this.resolve?.(null);
    return super.close(options);
  }

  async getData() {
    this._presets = await listPresets(this.context.actor, "damage");
    return {
      presets: this._presets.map(p => ({ name: p.name, selected: p.name === this.state.presetName })),
      weapons: (this.context.weapons || []).map(w => ({ id: w.id, name: w.name, selected: w.id === this.state.weaponId })),
      abilities: ["str","dex","con","int","wis","cha"],
      ability: this.state.ability,
      offhand: !!this.state.offhand,
      dmgMods: this.state.dmgMods ?? "",
      separate: !!this.state.separate,
      adv: this.state.adv,
      crit: !!this.state.crit,
      smart: !!this.state.smart,
      smartAbility: this.state.smartAbility ?? 0,
      smartProf: this.state.smartProf ?? 0
    };
  }

  static async promptName(title, placeholder = "") {
    if (Dialog?.prompt) {
      return Dialog.prompt({
        title, label: "Save",
        content: `<p>Name:</p><input type="text" style="width:100%" value="${placeholder}">`,
        callback: html => html.find("input").val()?.trim(),
        rejectClose: true
      });
    }
    return new Promise(resolve => {
      new Dialog({
        title,
        content: `<p>Name:</p><input type="text" style="width:100%" value="${placeholder}">`,
        buttons: {
          ok: { label: "Save", callback: html => resolve(html.find("input").val()?.trim()) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "ok",
        close: () => resolve(null)
      }).render(true);
    });
  }

  activateListeners(html) {
    html.on("submit", ev => { ev.preventDefault(); ev.stopPropagation(); return false; });
    const form = html.find("form")[0] ?? html[0];

    html.find('input[name="advMode"]').on("change", ev => { this.state.adv = ev.currentTarget.value || "normal"; });

    const read = () => {
      const f = new FormData(form);
      const adv = form.querySelector('input[name="advMode"]:checked')?.value || this.state.adv || "normal";
      this.state = {
        ...this.state,
        adv,
        presetName: f.get("presetName") || "",
        weaponId: f.get("weaponId") || this.state.weaponId,
        ability: (f.get("ability") || "").trim(),
        offhand: !!form.querySelector('input[name="offhand"]')?.checked,
        dmgMods: (f.get("dmgMods") || "").trim(),
        separate: !!form.querySelector('input[name="separate"]')?.checked,
        crit: !!form.querySelector('input[name="crit"]')?.checked,
        smart: !!form.querySelector('input[name="smart"]')?.checked,
        smartAbility: Number(f.get("smartAbility") ?? 0),
        smartProf: Number(f.get("smartProf") ?? 0)
      };
      return true;
    };

    const loadState = (ns) => { this.state = { ...this.state, ...ns }; this.render(false); };

    // Preset dropdown
    html.find('select[name="presetName"]').on("change", async ev => {
      read();
      const name = ev.currentTarget.value;
      if (!name) { this.state.presetName = ""; return; }
      const ps = await getPreset(this.context.actor, "damage", name);
      if (!ps) return ui.notifications.warn(`Preset not found: ${name}`);
      loadState({ ...ps, presetName: name });
      ui.notifications.info(`Loaded preset: ${name}`);
    });

    // Save
    html.find("[data-action=save]").on("click", async () => {
      read();
      const name = await DamageDialog.promptName("Save Damage Preset", this.state.presetName || "");
      if (!name) return;
      const clean = sanitizeDamageState(this.state);
      await savePreset(this.context.actor, "damage", name, clean);
      ui.notifications.info("Preset saved.");
      loadState({ presetName: name });
    });

    // Delete
    html.find("[data-action=delete]").on("click", async () => {
      read();
      const name = this.state.presetName;
      if (!name) return ui.notifications.warn("Select a preset to delete.");
      await deletePreset(this.context.actor, "damage", name);
      ui.notifications.info("Preset deleted.");
      loadState({ presetName: "" });
    });

    // Load Last Used
    html.find("[data-action=load-last]").on("click", async () => {
      const last = await getLastUsed(this.context.actor, "damage");
      if (!last) return ui.notifications.warn("No last-used damage found.");
      loadState({ ...last, presetName: "" });
      ui.notifications.info("Loaded last used.");
    });

    // Clear
    html.find("[data-action=clear]").on("click", () => {
      loadState({
        presetName: "",
        weaponId: this.context.weapons?.[0]?.id ?? "",
        ability: "", offhand: false, dmgMods: "", separate: false, adv: "normal", crit: false,
        smart: false, smartAbility: 0, smartProf: 0
      });
    });

    // Roll
    html.find("[data-action=roll]").on("click", ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (!read()) return;
      this._done = true;
      this.resolve?.(sanitizeDamageState(this.state));
      this.close();
    });

    // Cancel / Esc
    html.find("[data-action=cancel]").on("click", ev => {
      ev.preventDefault(); ev.stopPropagation();
      this._done = true; this.resolve?.(null); this.close();
    });
    html.find("form").on("keydown", ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); this._done = true; this.resolve?.(null); this.close(); }
      if (ev.key === "Enter")  { ev.preventDefault(); ev.stopPropagation(); html.find("[data-action=roll]")[0]?.click(); }
    });
  }

  static async prompt(context) {
    return new Promise(resolve => { const dlg = new DamageDialog(context); dlg.resolve = resolve; dlg.render(true); });
  }
}

export async function openDamageDialog(ctx) { return DamageDialog.prompt(ctx); }
