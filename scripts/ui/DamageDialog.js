// scripts/ui/DamageDialog.js
const MOD = "sw5e-helper";
const DAMAGE_TYPES = ["kinetic","energy","ion","acid","cold","fire","force","lightning","necrotic","poison","psychic","sonic","true"];

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
    this.item  = opts.item ?? null;        
    this.weapons = opts.weapons ?? null;   
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
    // Resolve item from weapons if not provided
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
      damageTypes: DAMAGE_TYPES.map(type => ({ value: type, label: type }))
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

    // FIXED: Add damage modifier row - use direct DOM manipulation instead of re-rendering
    html.find('[data-action="add-row"], [data-action="extra-add"]').on("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      
      const id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
      
      // Create new row HTML
      const newRowHtml = `
        <div class="modrow extra-row" data-id="${id}">
          <input type="text" class="mod-formula" placeholder="1d6" value="" />
          <select class="mod-type">
            ${DAMAGE_TYPES.map(type => `<option value="${type}">${type}</option>`).join('')}
          </select>
          <label><input type="checkbox" class="mod-incrit" /> In Crit</label>
          <button type="button" data-action="remove-row" data-id="${id}" title="Remove Row">×</button>
        </div>
      `;
      
      // Add to existing container (preserves all user input)
      const container = html.find('.extra-rows-container, .extras-content, .extras .form-group').last();
      if (container.length) {
        container.append(newRowHtml);
      } else {
        // Fallback: add after the last modrow
        html.find('.modrow').last().after(newRowHtml);
      }
      
      // Update internal state
      this.state.extraRows = [...(this.state.extraRows || []), { id, formula: "", type: "kinetic", inCrit: false }];
    });
    
    // FIXED: Delete damage modifier row - use direct DOM removal instead of re-rendering
    html.on("click", '[data-action="del-row"], [data-action="extra-remove"], [data-action="remove-row"]', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      
      const row = ev.currentTarget.closest(".modrow, .extra-row");
      const id = row?.dataset?.id || row?.dataset?.rowid || $(ev.currentTarget).data('id');
      if (!id) return;
      
      // Remove from DOM immediately (preserves all other user input)
      $(row).remove();
      
      // Update internal state
      this.state.extraRows = (this.state.extraRows || []).filter(r => String(r.id) !== String(id));
    });

    // When user changes weapon in manual mode, re-resolve this.item and re-render
    html.find('select[name="weaponId"]').on("change", (ev) => {
      read();
      if (this.scope?.type === "manual" && this.state.weaponId) {
        this.item = this.actor?.items?.get(this.state.weaponId) || this.item;
      }
      this.render(true);
    });

    html.find('[data-action="cancel"]').on("click", () => { 
      this._resolve?.(null); 
      this.close(); 
    });

    html.find('[data-action="roll"]').on("click", async () => {
      read();
      
      // Return the state directly - the caller will handle the rolling
      this._resolve?.(this.state);
      this.close();
    });
  }
}

// ---------- internal helpers (dialog-local) ----------
function _firstDieFaces(formula) {
  const m = String(formula || "").match(/(\d*)d(\d+)/i);
  return m ? Number(m[2]) : null;
}

// convenience
export async function openDamageDialog({ actor, item, weapons, seed, scope }) {
  const dlg = new DamageDialog({ actor, item, weapons, seed, scope });
  dlg.render(true);
  return await dlg.wait();
}