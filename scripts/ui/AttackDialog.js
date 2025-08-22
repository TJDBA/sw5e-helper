// scripts/ui/AttackDialog.js
import {
  listPresets, getPreset, savePreset, deletePreset,
  getLastUsed, sanitizeAttackState
} from "../core/services/presets.js";

import {
  getSaveForItem,          // returns { ability, dc } | null
  parseSmartDefaults,      // returns { abilityMod, profBonus } | null
  getItemAttackBonus       // returns number (flat item attack bonus +X)
} from "../core/adapter/sw5e.js";

const MODULE_ID = "sw5e-helper";

export class AttackDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: `${game.modules.get(MODULE_ID).path}/templates/attack-dialog.hbs`,
      width: 520,
      height: "auto",
      title: game.i18n.localize("SW5EHELPER.AttackTitle"),
      classes: ["sw5e-helper-attack"]
    });
  }

  constructor(context, seed = {}) {
    super();
    this.context = context;              // { actor, weapons }
    this._done = false;

    // Template path
    const mod = game.modules.get("sw5e-helper");
    const base = mod?.path || "modules/sw5e-helper";
    this.options.template = `${base}/templates/attack-dialog.hbs`;

    // Initial state (explicit defaults; seed can override)
    this._presets = [];
    this.state = {
      // Core
      adv: "normal",
      weaponId: context?.weapons?.[0]?.id ?? "",
      ability: "",
      offhand: false,
      separate: false,
      atkMods: "",
      presetName: "",

      // Smart Weapon Override (left blank if SMART parse fails)
      smart: false,
      smartAbility: "",
      smartProf: "",

      // Saving Throw
      saveOnHit: false,
      saveAbility: "",
      saveDcFormula: "",
      saveOnly: false,

      // Allow caller to override any defaults
      ...seed
    };
  }

  async close(options) {
    if (!this._done) this.resolve?.(null);
    return super.close(options);
  }

  async getData() {
    this._presets = await listPresets(this.context.actor, "attack");

    const weaponsAll = this.context.weapons ?? [];
    const selected = weaponsAll.find(w => w.id === this.state.weaponId) ?? weaponsAll[0];
    const selectedId = selected?.id ?? "";
    const item = selected?.item ?? this.context.actor?.items?.get?.(selectedId);

    // Attack bonus display (read-only)
    const attackBonusDisplay = (item ? getItemAttackBonus(this.context.actor, item) : 0) ?? 0;

    // Smart defaults & visibility
    const showSmart = !!item?.system?.properties?.smr;
    if (showSmart) {
      const seed = parseSmartDefaults?.(item) ?? null; // { abilityMod, profBonus }|null
      // Only seed blanks (don’t overwrite user edits)
      if (seed) {
        if (this.state.smartAbility === "" || this.state.smartAbility === undefined) this.state.smartAbility = seed.abilityMod;
        if (this.state.smartProf === "" || this.state.smartProf === undefined) this.state.smartProf = seed.profBonus;
      }
    } else {
      // Hide block; keep any stored values but don’t show them
    }

    // Saving-throw prefill (can be overridden)
    const fromItemSave = getSaveForItem?.(item) ?? null; // { ability, dc }|null
    if (fromItemSave) {
      if (!this.state.saveAbility)   this.state.saveAbility = fromItemSave.ability;
      if (!this.state.saveDcFormula) this.state.saveDcFormula = String(fromItemSave.dc);
      if (this.state.saveOnHit === undefined) this.state.saveOnHit = true;
    }

    return {
      // Per-weapon favorites list
      presets: (this._presets || [])
        .filter(p => p.weaponId ? p.weaponId === selectedId : true) // legacy presets have no weaponId
        .map(p => ({ name: p.name, selected: p.name === this.state.presetName })),
      weapons: weaponsAll.map(w => ({ id: w.id, name: w.name, selected: w.id === selectedId })),
      abilities: ["str","dex","con","int","wis","cha"],
      ability: this.state.ability,
      offhand: !!this.state.offhand,
      atkMods: this.state.atkMods ?? "",
      separate: !!this.state.separate,
      // radios now support name="adv" in HBS
      adv: this.state.adv,
      // Smart
      showSmart,
      smart: !!this.state.smart,
      smartAbility: this.state.smartAbility ?? "",
      smartProf: this.state.smartProf ?? "",
      // Saving throw block
      saveOnHit: !!this.state.saveOnHit,
      saveAbility: this.state.saveAbility ?? "",
      saveDcFormula: this.state.saveDcFormula ?? "",
      saveOnly: !!this.state.saveOnly,
      // Features (optional hook; keep if you already supply)
      features: this.context.features ?? [],
      // Read-only attack bonus
      attackBonusDisplay
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
    super.activateListeners(html);

    const $hit  = html.find('input[name="saveOnHit"]');
    const $only = html.find('input[name="saveOnly"]');

    $hit.on("change", ev => {
      if (ev.currentTarget.checked) $only.prop("checked", false);
      //this.render(false); // optional; remove if not needed
    });

    $only.on("change", ev => {
      if (ev.currentTarget.checked) $hit.prop("checked", false);
      //this.render(false); // optional; remove if not needed
    });

    html.on("submit", ev => { ev.preventDefault(); ev.stopPropagation(); return false; });

    const form = html.find("form")[0] ?? html[0];

    html.find('input[name="advMode"]').on("change", ev => {
      this.state.adv = ev.currentTarget.value || "normal";
    });

    const read = () => {
      const f = new FormData(form);
      const saveOnHitChecked  = !!form.querySelector('input[name="saveOnHit"]')?.checked;
      const saveOnlyChecked   = !!form.querySelector('input[name="saveOnly"]')?.checked;
      const saveOnHit  = saveOnlyChecked ? false : saveOnHitChecked;
      const saveOnly   = saveOnHitChecked ? false : saveOnlyChecked;
      const adv =
        form.querySelector('input[name="adv"]:checked')?.value ??
        form.querySelector('input[name="advMode"]:checked')?.value ??
        this.state.adv ?? "normal";
      this.state = {
        ...this.state,
        adv,
        presetName: f.get("presetName") || "",
        weaponId: f.get("weaponId") || this.state.weaponId,
        ability: (f.get("ability") || "").trim(),
        offhand: !!form.querySelector('input[name="offhand"]')?.checked,
        atkMods: (f.get("atkMods") || "").trim(),
        separate: !!form.querySelector('input[name="separate"]')?.checked,
        // Smart Weapon fields
        smart: !!form.querySelector('input[name="smart"]')?.checked,
        smartAbility: (f.get("smartAbility") ?? "").toString().trim(),
        smartProf: (f.get("smartProf") ?? "").toString().trim(),
        // Saving throw fields (set ONCE)
        saveOnHit,
        saveOnly,
        saveAbility: (f.get("saveAbility") || "").toString().trim(),
        saveDcFormula: (f.get("saveDcFormula") || "").toString().trim()
      };
      return true;
    };

    const loadState = (newState) => { this.state = { ...this.state, ...newState }; this.render(false); };

    
    // Preset dropdown load
    html.find('select[name="presetName"]').on("change", async ev => {
      read();
      const name = ev.currentTarget.value;
      if (!name) { this.state.presetName = ""; return; }
      const ps = await getPreset(this.context.actor, "attack", name);
      if (!ps) return ui.notifications.warn(`Preset not found: ${name}`);
      loadState({ ...ps, presetName: name });
      ui.notifications.info(`Loaded preset: ${name}`);
    });

    // Save
    html.find("[data-action=save]").on("click", async () => {
      read();
      const name = await AttackDialog.promptName("Save Attack Preset", this.state.presetName || "");
      if (!name) return;
      const clean = { ...sanitizeAttackState(this.state), weaponId: this.state.weaponId };
      await savePreset(this.context.actor, "attack", name, clean);
      ui.notifications.info("Preset saved.");
      loadState({ presetName: name });
    });

    // Delete
    html.find("[data-action=delete]").on("click", async () => {
      read();
      const name = this.state.presetName;
      if (!name) return ui.notifications.warn("Select a preset to delete.");
      await deletePreset(this.context.actor, "attack", name);
      ui.notifications.info("Preset deleted.");
      loadState({ presetName: "" });
    });

    // Load Last Used
    html.find("[data-action=load-last]").on("click", async () => {
      const last = await getLastUsed(this.context.actor, "attack");
      if (!last) return ui.notifications.warn("No last-used attack found.");
      // Trust last-used weaponId; let re-render recompute smart/save defaults
      this.state = { ...this.state, ...last };
      this.render(false);
      ui.notifications.info(game.i18n.localize("SW5EHELPER.LoadedLast"));
    });

    // Clear
    html.find("[data-action=clear]").on("click", () => {
      loadState({
        presetName: "",
        weaponId: this.context.weapons?.[0]?.id ?? "",
        ability: "", offhand: false, atkMods: "", separate: false, adv: "normal",
        smart: false, smartAbility: 0, smartProf: 0
      });
    });

    // Roll (validates Smart + Save Only, then submits enriched payload)
    html.find("[data-action=roll]").on("click", ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (!read()) return;

      // Smart validation (if checked and visible)
      const useSmart = !!this.state.smart;
      if (useSmart) {
        const sa = Number(this.state.smartAbility);
        const sp = Number(this.state.smartProf);
        if (!Number.isFinite(sa) || !Number.isFinite(sp)) {
          return ui.notifications.warn(game.i18n.localize("SW5EHELPER.SmartValuesRequired"));
        }
      }


      // Build payload (don’t mutate presets)
      const payload = {
        ...sanitizeAttackState(this.state),
        saveOnly: !!this.state.saveOnly,
        save: {
          requireOnHit: !!this.state.saveOnHit,
          ability: this.state.saveAbility || "",
          dcFormula: this.state.saveDcFormula || ""
        }
      };

      this._done = true;
      this.resolve?.(payload);
      this.close();
    });

    html.find("[data-action=cancel]").on("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      this._done = true;
      this.resolve?.(null);
      this.close();
    });


    // Enter/Esc
    html.find("form").on("keydown", ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); this._done = true; this.resolve?.(null); this.close(); }
      if (ev.key === "Enter")  { ev.preventDefault(); ev.stopPropagation(); html.find("[data-action=roll]")[0]?.click(); }
    });

    // When weapon changes, re-read and re-render so Smart/Save blocks and attack bonus refresh
    html.find('select[name="weaponId"]').on("change", () => { 
        read(); this.render(false); 
    });

    // Load selected preset (explicit button)
    html.find("[data-action=load-preset]").on("click", async () => {
      read();
      const name = this.state.presetName;
      if (!name) return ui.notifications.warn(game.i18n.localize("SW5EHELPER.None"));
      const ps = await getPreset(this.context.actor, "attack", name);
      if (!ps) return ui.notifications.warn(`Preset not found: ${name}`);
      // Guard: only load if weapon matches or preset has no weaponId (legacy)
      if (ps.weaponId && ps.weaponId !== this.state.weaponId) {
        ui.notifications.warn(game.i18n.localize("SW5EHELPER.PresetWrongWeapon"));
        return;
      }
      // Merge but keep current weaponId if preset missing one
      this.state = { ...this.state, ...ps, weaponId: ps.weaponId ?? this.state.weaponId, presetName: name };
      this.render(false);
      ui.notifications.info(`Loaded preset: ${name}`);
    });

  }

  static async prompt(context) {
    return new Promise(resolve => { const dlg = new AttackDialog(context); dlg.resolve = resolve; dlg.render(true); });
  }
}

export async function openAttackDialog(ctx) { return AttackDialog.prompt(ctx); }
