export class DamageDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "modules/sw5e-helper/templates/damage-dialog.hbs",
      width: 480, height: "auto", title: game.i18n.localize("SW5EHELPER.DamageTitle")
    });
  }

  constructor(context) { super(); this.context = context; this.state = { adv: "normal" }; }

  async getData() {
    return {
      presets: [],
      weapons: this.context.weapons,
      abilities: ["str","dex","con","int","wis","cha"],
      offhand: !!this.state.offhand,
      crit: !!this.state.crit,
      superiority: !!this.state.superiority
    };
  }

  activateListeners(html) {
    const read = () => {
      const f = new FormData(html[0].querySelector("form"));
      const separate = !!html[0].querySelector("input[name=separate]")?.checked;
      this.state = {
        ...this.state,
        weaponId: f.get("weaponId"),
        ability: f.get("ability") || "",
        offhand: !!html[0].querySelector("input[name=offhand]")?.checked,
        crit: !!html[0].querySelector("input[name=crit]")?.checked,
        separate,
        superiority: separate ? false : !!html[0].querySelector("input[name=superiority]")?.checked,
        dmgMods: (f.get("dmgMods") || "").trim()
      };
    };

    html.on("click", "[data-adv]", ev => { this.state.adv = ev.currentTarget.dataset.adv; });
    html.on("click", "[data-action=clear]", () => { this.state = { adv: "normal" }; this.render(); });
    html.on("click", "[data-action=load-last]", () => ui.notifications.info("Last Used: TODO"));
    html.on("click", "[data-action=save]", () => ui.notifications.info("Save preset: TODO"));
    html.on("click", "[data-action=delete]", () => ui.notifications.info("Delete preset: TODO"));
    html.on("click", "[data-action=cancel]", () => this.close());

    html.on("submit", ev => { ev.preventDefault(); read(); this.resolve?.(this.state); this.close(); });
  }

  static async prompt(context) {
    return new Promise(resolve => {
      const dlg = new DamageDialog(context);
      dlg.resolve = resolve;
      dlg.render(true);
    });
  }
}

export async function openDamageDialog(ctx) { return DamageDialog.prompt(ctx); }
