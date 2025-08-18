export class AttackDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "modules/sw5e-helper/templates/attack-dialog.hbs",
      width: 520,
      height: "auto",
      title: game.i18n.localize("SW5EHELPER.AttackTitle"),
      classes: ["sw5e-helper-attack"]
    });
  }

  constructor(context) {
    super();
    this.context = context;
    this.state = {
      adv: "normal",
      weaponId: context.weapons?.[0]?.id ?? "",
      ability: "",
      offhand: false,
      atkMods: "",
      separate: false
    };
  }

  async getData() {
    return {
      presets: [],
      weapons: this.context.weapons.map(w => ({ id: w.id, name: w.name, selected: w.id === this.state.weaponId })),
      abilities: ["str","dex","con","int","wis","cha"],
      ability: this.state.ability,
      offhand: !!this.state.offhand,
      atkMods: this.state.atkMods ?? "",
      separate: !!this.state.separate,
      adv: this.state.adv
    };
  }

  activateListeners(html) {
    // Block any submit refresh
    html.on("submit", ev => { ev.preventDefault(); ev.stopPropagation(); return false; });

    const form = html.find("form")[0] ?? html[0];

    const read = () => {
      const f = new FormData(form);
      const adv = form.querySelector('input[name="advMode"]:checked')?.value || "normal";
      this.state = {
        ...this.state,
        adv,
        weaponId: f.get("weaponId") || this.state.weaponId,
        ability: (f.get("ability") || "").trim(),
        offhand: !!form.querySelector('input[name="offhand"]')?.checked,
        atkMods: (f.get("atkMods") || "").trim(),
        separate: !!form.querySelector('input[name="separate"]')?.checked
      };
      return true;
    };

    const rollNow = () => { if (read()) { this.resolve?.(this.state); this.close(); } };

    html.find("[data-action=roll]").on("click", ev => { ev.preventDefault(); ev.stopPropagation(); rollNow(); });
    html.find("[data-action=cancel]").on("click", ev => { ev.preventDefault(); ev.stopPropagation(); this.close(); });

    // Enter = Roll, Esc = Cancel
    html.find("form").on("keydown", ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); this.close(); }
      if (ev.key === "Enter")  { ev.preventDefault(); ev.stopPropagation(); rollNow(); }
    });
  }

  static async prompt(context) {
    return new Promise(resolve => { const dlg = new AttackDialog(context); dlg.resolve = resolve; dlg.render(true); });
  }
}

export async function openAttackDialog(ctx) { return AttackDialog.prompt(ctx); }
