// scripts/ui/DamageDialog.js
const MOD = "sw5e-helper";

export class DamageDialog extends FormApplication {
  static get defaultOptions() {
    const mod = game.modules.get(MOD);
    const base = mod?.path || `modules/${MOD}`;
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sw5e-helper-damage",
      template: `${base}/templates/damage-dialog.hbs`,
      classes: ["sw5e-helper", "damage"],
      width: 560,
      height: "auto",
      resizable: true,
      title: game.i18n.localize("SW5EHELPER.Damage") || "Damage"
    });
  }

  /** @param {{actor:Actor, item:Item, seed?:object, scope?:{type:"card"|"row", ref?:string}}} opts */
  constructor(opts) {
    super();
    this.actor = opts.actor;
    this.item  = opts.item ?? null;        // ← may be null for manual
    this.weapons = opts.weapons ?? null;   // ← list for manual mode
    this.scope = opts.scope || { type: "card" };
    const s = opts.seed || {};
    this.state = {
      // seeded from card
      weaponId: s.weaponId || this.item?.id || (this.weapons?.[0]?.id ?? ""),
      ability: s.ability || "",
      offhand: !!s.offhand,
      smart: !!s.smart,
      smartAbility: Number(s.smartAbility ?? 0) || 0,
      separate: !!s.separate,
      isCrit: !!s.isCrit,
      // extras (none by default; you can wire preset support later)
      extraRows: s.extraRows ?? [],
      presetName: "",
    };
    this._resolve = null;
    this._reject = null;
  }

  async wait() {
    return new Promise((res, rej) => { this._resolve = res; this._reject = rej; });
  }

  // ---------- data ----------
  async getData() {
  // ← NEW: resolve item from weapons if not provided
  if (!this.item) {
    const list = Array.isArray(this.weapons) ? this.weapons : [];
    const selId = this.state.weaponId || list[0]?.id;
    if (selId) this.item = this.actor?.items?.get(selId);
  }
  if (!this.item) throw new Error("DamageDialog requires a valid weapon Item.");

  const item = this.item;
  const sys  = item.system ?? {};
  const parts = Array.isArray(sys.damage?.parts) ? sys.damage.parts : [];
  const weaponDamageParts = parts.map(([formula, type], idx) => ({
    formula: String(formula || "0"),
    typeLabel: String(type || ""),
    isBase: idx === 0
  }));

  const showSmart  = !!sys.properties?.smr;
  const brutalVal  = Number(sys.properties?.brutal ?? 0) || 0;
  const showBrutal = brutalVal > 0;
  const baseFaces  = _firstDieFaces(weaponDamageParts[0]?.formula);

  const weaponLocked = this.scope?.type === "card" || this.scope?.type === "row";

  return {
    weapons: this.weapons ? this.weapons.map(w => ({ id:w.id, name:w.name, selected: w.id === this.state.weaponId }))
                          : [{ id: item.id, name: item.name, selected: true }],
    weaponLocked,
    presets: [],
    abilities: ["str","dex","con","int","wis","cha"],

    ability: this.state.ability,
    offhand: this.state.offhand,
    smart: this.state.smart,
    smartAbility: this.state.smartAbility,
    separate: this.state.separate,
    isCrit: this.state.isCrit,

    showSmart,
    weaponDamageParts,
    showBrutal,
    brutalXdY: showBrutal && baseFaces ? `${brutalVal}d${baseFaces}` : "",
    
    extraRows: this.state.extraRows,
    damageTypes: []
  };
}

activateListeners(html) {
  super.activateListeners(html);
  const form = html[0];

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
    this.state = {
      ...this.state,
      weaponId: (f.get("weaponId") || this.state.weaponId).toString(),
      ability: (f.get("ability") || "").toString().trim(),
      offhand: !!form.querySelector('input[name="offhand"]')?.checked,
      smart: !!form.querySelector('input[name="smart"]')?.checked,
      smartAbility: Number(f.get("smartAbility") ?? 0) || 0,
      separate: !!form.querySelector('input[name="separate"]')?.checked,
      isCrit: !!form.querySelector('input[name="isCrit"]')?.checked,
      extraRows: readRows()
    };
    return true;
  };

    html.find('[data-action="cancel"]').on("click", () => { this._reject?.("cancel"); this.close(); });

    html.find('[data-action="roll"]').on("click", async () => {
      read();
      const result = await _rollDamageFromDialog({
        actor: this.actor, item: this.item, state: this.state, scope: this.scope
      });
      this._resolve?.(result);
      this.close();
    });

    // presets auto-load on select change (future)
    html.find('select[name="presetName"]').on("change", () => { /* no-op for now */ });

    // ← NEW: when user changes weapon in manual mode, re-resolve this.item and re-render
    html.find('select[name="weaponId"]').on("change", (ev) => {
      read();
      if (this.scope?.type === "manual" && this.state.weaponId) {
        this.item = this.actor?.items?.get(this.state.weaponId) || this.item;
      }
      this.render(true);
    });

    // Add damage modifier row
    html.find("[data-action=add-row]").on("click", () => {
      const id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
      this.state.extraRows = [...(this.state.extraRows || []), { id, formula: "", type: "kinetic", inCrit: false }];
      this.render(false);
    });
    
    // Delete damage modifier row
    html.on("click", "[data-action=del-row]", (ev) => {
      const row = ev.currentTarget.closest(".modrow");
      const id = row?.dataset?.id;
      if (!id) return;
      this.state.extraRows = (this.state.extraRows || []).filter(r => String(r.id) !== String(id));
      this.render(false);
    });

    html.find('[data-action="cancel"]').on("click", () => { this._reject?.("cancel"); this.close(); });
    html.find('[data-action="roll"]').on("click", async () => {
      read();
      const result = await _rollDamageFromDialog({
        actor: this.actor, item: this.item, state: this.state, scope: this.scope
      });
      this._resolve?.(result);
      this.close();
    });
  }
}

// ---------- internal helpers (dialog-local) ----------
function _firstDieFaces(formula) {
  const m = String(formula || "").match(/(\d*)d(\d+)/i);
  return m ? Number(m[2]) : null;
}

function _doubleDice(formula) {
  return String(formula).replace(/\b(\d*)d(\d+)\b/gi, (_m, n, d) => `${Math.max(1, Number(n||1))*2}d${d}`);
}

function _weaponFormula(item) {
  const parts = item?.system?.damage?.parts ?? [];
  const formulas = parts.map(p => Array.isArray(p) ? p[0] : (p?.[0] ?? p?.formula ?? p)).filter(Boolean);
  return formulas.length ? formulas.join(" + ") : "0";
}

function _usesAtMod(item) {
  return /@mod\b/i.test(_weaponFormula(item));
}

function _abilityMod({ actor, item, ability, smart, smartAbility, offhand }) {
  let mod;
  if (smart) mod = Number(smartAbility || 0);
  else {
    const key = ability || item?.system?.ability || "str";
    mod = Number(foundry.utils.getProperty(actor, `system.abilities.${key}.mod`) ?? 0);
  }
  if (offhand && mod > 0) mod = 0;
  return mod;
}

/**
 * Returns { rolls: Roll[], perTargetTotals: Map<ref, number> }
 * - scope.type === "row": compute one target (scope.ref), seed crit from card row but allow user checkbox override
 * - scope.type === "card": if separate -> per-target; else -> shared by outcome groups (crit/hit)
 */
async function _rollDamageFromDialog({ actor, item, state, scope }) {
  const usesAtMod = _usesAtMod(item);
  const abilityMod = _abilityMod({ actor, item, ...state });
  const base = _weaponFormula(item);
  const brutalVal = Number(item?.system?.properties?.brutal ?? 0) || 0;
  const baseFaces = _firstDieFaces(base);

  const extras = Array.isArray(state.extraRows) ? state.extraRows : [];

  // Produce a final formula for a given crit flag
  const makeFormula = (isCrit) => {
    let f = isCrit ? _doubleDice(base) : base;
    if (isCrit && brutalVal > 0 && baseFaces) f = `${f} + ${brutalVal}d${baseFaces}`;
    if (!usesAtMod && abilityMod) f = `${f} + ${abilityMod}`;

    // extras: add as-is; if marked inCrit and crit, double dice for that extra chunk
    for (const r of extras) {
      if (!r?.formula) continue;
      const chunk = (isCrit && r.inCrit) ? _doubleDice(r.formula) : r.formula;
      f = `${f} + (${chunk})`;
    }
    return f;
  };

  const doRoll = async (formula) => {
    const data = usesAtMod ? { mod: abilityMod } : {};
    const roll = await (new Roll(formula, data)).evaluate({ async: true });
    try { await game.dice3d?.showForRoll?.(roll, game.user, true); } catch (_) {}
    return roll;
  };

  const msg = ui?.chat?.element?.find?.(".message").last()?.data("messageId"); // not required
  const perTargetTotals = new Map();
  const rolls = [];

  // Resolve eligible targets from scope
  const cardState = scope?.cardState; // optional (set by caller)
  const targets = (cardState?.targets ?? []).map(t => ({ ref: `${t.sceneId}:${t.tokenId}`, status: t.attack?.status }));

  if (scope.type === "row") {
    // single target
    const isCrit = !!state.isCrit;
    const r = await doRoll(makeFormula(isCrit));
    rolls.push(r);
    perTargetTotals.set(scope.ref, r.total ?? 0);
    return { rolls, perTargetTotals };
  }

  // scope: card
  if (state.separate) {
    for (const t of targets) {
      const s = t.status;
      if (!s || s === "miss" || s === "fumble") continue;
      const isCrit = s === "crit" ? true : false;
      const r = await doRoll(makeFormula(isCrit));
      rolls.push(r);
      perTargetTotals.set(t.ref, r.total ?? 0);
    }
  } else {
    const critRefs = [], hitRefs = [];
    for (const t of targets) {
      const s = t.status;
      if (!s || s === "miss" || s === "fumble") continue;
      (s === "crit" ? critRefs : hitRefs).push(t.ref);
    }
    if (critRefs.length) {
      const r = await doRoll(makeFormula(true));
      rolls.push(r);
      for (const ref of critRefs) perTargetTotals.set(ref, r.total ?? 0);
    }
    if (hitRefs.length) {
      const r = await doRoll(makeFormula(false));
      rolls.push(r);
      for (const ref of hitRefs) perTargetTotals.set(ref, r.total ?? 0);
    }
  }

  return { rolls, perTargetTotals };
}

// convenience
export async function openDamageDialog({ actor, item, weapons, seed, scope }) {
  const dlg = new DamageDialog({ actor, item, weapons, seed, scope });
  dlg.render(true);
  return await dlg.wait();
}







// scripts/ui/DamageDialog.js
/*import {
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
*/