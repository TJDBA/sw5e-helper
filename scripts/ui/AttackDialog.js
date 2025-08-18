// scripts/ui/AttackDialog.js
const MODULE_ID = "sw5e-helper";

export class AttackDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // We'll set template dynamically in the constructor
      template: null,
      width: 520,
      height: "auto",
      title: game.i18n.localize("SW5EHELPER.AttackTitle"),
      classes: ["sw5e-helper-attack"]
    });
  }

  constructor(context) {
    super();
    this.context = context;
    // Compute template path dynamically to avoid hardcoded folder issues
    const mod = game.modules.get(MODULE_ID);
    const base = mod?.path || `modules/${MODULE_ID}`;
    this.options.template = `${base}/templates/attack-dialog.hbs`;

    this.state = {
      adv: "normal",
      weaponId: context.weapons?.[0]?.id ?? "",
      ability: "",
      offhand: false,
      atkMods: "",
      separate: false
    };
    console.debug("SW5E Helper (UI) AttackDialog ctor", { template: this.options.template, context });
  }

  async getData() {
    const data = {
      presets: [],
      weapons: (this.context.weapons || []).map(w => ({ id: w.id, name: w.name, selected: w.id === this.state.weaponId })),
      abilities: ["str","dex","con","int","wis","cha"],
      ability: this.state.ability,
      offhand: !!this.state.offhand,
      atkMods: this.state.atkMods ?? "",
      separate: !!this.state.separate,
      adv: this.state.adv
    };
    return data;
  }

  activateListeners(html) {
    console.debug("SW5E Helper (UI) AttackDialog activateListeners");
    // Block any submit refresh
    html.on("submit", ev => { ev.preventDefault(); ev.stopPropagation(); return false; });

    const form = html.find("form")[0] ?? html[0];

    // keep adv in sync live
    html.find('input[name="advMode"]').on("change", ev => {
      this.state.adv = ev.currentTarget.value || "normal";
      console.debug("SW5E Helper (UI) adv changed:", this.state.adv);
    });

    const read = () => {
      try {
        const f = new FormData(form);
        const adv = form.querySelector('input[name="advMode"]:checked')?.value || this.state.adv || "normal";
        this.state = {
          ...this.state,
          adv,
          weaponId: f.get("weaponId") || this.state.weaponId,
          ability: (f.get("ability") || "").trim(),
          offhand: !!form.querySelector('input[name="offhand"]')?.checked,
          atkMods: (f.get("atkMods") || "").trim(),
          separate: !!form.querySelector('input[name="separate"]')?.checked
        };
        console.debug("SW5E Helper (UI) state before roll:", this.state);
        return true;
      } catch (e) {
        console.error("SW5E Helper (UI) read() failed", e);
        ui.notifications.error("SW5E Helper: failed to read the Attack form (see console).");
        return false;
      }
    };

    const rollNow = () => {
      if (!read()) return;
      try {
        this.resolve?.(this.state);
        this.close();
      } catch (e) {
        console.error("SW5E Helper (UI) resolving to engine failed", e);
        ui.notifications.error("SW5E Helper: roll dispatch failed (see console).");
      }
    };

    html.find("[data-action=roll]").on("click", ev => { ev.preventDefault(); ev.stopPropagation(); rollNow(); });
    html.find("[data-action=cancel]").on("click", ev => { ev.preventDefault(); ev.stopPropagation(); this.close(); });

    // Enter = Roll, Esc = Cancel
    html.find("form").on("keydown", ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); this.close(); }
      if (ev.key === "Enter")  { ev.preventDefault(); ev.stopPropagation(); rollNow(); }
    });
  }

  static async prompt(context) {
    return new Promise(resolve => {
      const dlg = new AttackDialog(context);
      dlg.resolve = resolve;
      console.debug("SW5E Helper (UI) rendering AttackDialog");
      dlg.render(true);
    });
  }
}

export async function openAttackDialog(ctx) { return AttackDialog.prompt(ctx); }
