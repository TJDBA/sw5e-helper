// scripts/ui/DamageDialog.js
import {
  listPresets, getPreset, savePreset, deletePreset,
  getLastUsed, sanitizeDamageState
} from "../core/services/presets.js";

const MODULE_ID = "sw5e-helper";
const DAMAGE_TYPES = ["kinetic","energy","ion","acid","cold","fire","force","lightning","necrotic","poison","psychic","sonic","true"];

export class DamageDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: null,
      width: 560,
      height: "auto",
      title: game.i18n.localize("SW5EHELPER.DamageTitle"),
      classes: ["sw5e-helper-damage"]
    });
  }

  constructor(context) {
    super();
    this.context = context;
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

      // Smart weapon
      smart: false,
      smartAbility: 0,

      // Extra rows
      extraRows: [],

      // Crit / separate / min-die
      crit: false,
      separate: false,
      useMinDie: false,

      // Once-per-turn
      otpDamageAdv: false,
      otpDamageDis: false,

      presetName: ""
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
      smart: !!this.state.smart,
      smartAbility: this.state.smartAbility ?? 0,

      extraRows: this.state.extraRows || [],
      damageTypes: DAMAGE_TYPES,

      crit: !!this.state.crit,
      separate: !!this.state.separate,

      useMinDie: !!this.state.useMinDie,

      otpDisabled: !!this.state.separate,
      otpDamageAdv: !!this.state.otpDamageAdv,
      otpDamageDis: !!this.state.otpDamageDis,

      adv: this.state.adv
    };
  }

  static _uuid() { return crypto.randomUUID?.() ?? String(Math.random()).slice(2); }

  static async promptName(title, seed="") {
    return Dialog.prompt({
      title, label: "Save",
      content: `<p>Name:</p><input type="text" style="width:100%" value="${seed}">`,
      callback: html => html.find("input").val()?.trim(),
      rejectClose: true
    });
  }

  activateListeners(html) {
    html.on("submit", ev => { ev.preventDefault(); ev.stopPropagation(); return false; });
    const form = html.find("form")[0] ?? html[0];

    // Keep adv in sync
    html.find('input[name="advMode"]').on("change", ev => { this.state.adv = ev.currentTarget.value || "normal"; });

    // Once-per-turn mutual exclusion (adv/dis)
    const syncOtp = () => {
      if (this.state.otpDamageAdv && this.state.otpDamageDis) {
        // prefer last toggled; here simple rule: if both, turn off Dis
        this.state.otpDamageDis = false;
      }
    };

    // Separate disables once-per-turn toggles
    html.find('input[name="separate"]').on("change", ev => {
      const sep = ev.currentTarget.checked;
      this.state.separate = sep;
      if (sep) { this.state.otpDamageAdv = false; this.state.otpDamageDis = false; }
      this.render(false);
    });

    html.find('input[name="otpDamageAdv"]').on("change", ev => { this.state.otpDamageAdv = !!ev.currentTarget.checked; syncOtp(); });
    html.find('input[name="otpDamageDis"]').on("change", ev => { this.state.otpDamageDis = !!ev.currentTarget.checked; syncOtp(); });

    const readRows = () => {
      const rows = [];
      html.find(".modrow").each((_, el) => {
        const $el = $(el);
        rows.push({
          id: $el.data("id"),
          formula: $el.find(".mod-formula").val()?.toString().trim() || "",
          type: $el.find(".mod-type").val() || "kinetic",
          inCrit: !!$el.find(".mod-incrit")[0]?.checked
        });
      });
      return rows;
    };

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

        smart: !!form.querySelector('input[name="smart"]')?.checked,
        smartAbility: Number(f.get("smartAbility") ?? 0),

        extraRows: readRows(),

        crit: !!form.querySelector('input[name="crit"]')?.checked,
        separate: !!form.querySelector('input[name="separate"]')?.checked,

        useMinDie: !!form.querySelector('input[name="useMinDie"]')?.checked,

        otpDamageAdv: !!form.querySelector('input[name="otpDamageAdv"]')?.checked,
        otpDamageDis: !!form.querySelector('input[name="otpDamageDis"]')?.checked
      };
      return true;
    };

    const loadState = ns => { this.state = { ...this.state, ...ns }; this.render(false); };

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
      await savePreset(this.context.actor, "damage", name, sanitizeDamageState(this.state));
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
        ability: "", offhand: false,
        smart: false, smartAbility: 0,
        extraRows: [],
        crit: false, separate: false,
        useMinDie: false, 
        otpDamageAdv: false, otpDamageDis: false,
        adv: "normal"
      });
    });

    // Row builder
    html.find("[data-action=add-row]").on("click", () => {
      const id = DamageDialog._uuid();
      this.state.extraRows = [...(this.state.extraRows || []), { id, formula: "", type: "kinetic", inCrit: false }];
      this.render(false);
    });
    
    html.on("click", "[data-action=del-row]", (ev) => {
      const row = ev.currentTarget.closest(".modrow");
      const id = row?.dataset?.id;
      if (!id) return;
      this.state.extraRows = (this.state.extraRows || []).filter(r => String(r.id) !== String(id));
      this.render(false);
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
    html.find("[data-action=cancel]").on("click", ev => { ev.preventDefault(); ev.stopPropagation(); this._done = true; this.resolve?.(null); this.close(); });
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
