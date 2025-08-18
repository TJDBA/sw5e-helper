// scripts/core/engine/damage.js
import { getWeaponById } from "../adapter/sw5e.js";

const signed = n => `${n >= 0 ? "+" : ""}${n}`;

function deriveDefaultAbility(item) {
  const sys = item.system ?? {};
  if (sys.ability) return sys.ability;
  const type = sys.actionType || sys.activation?.type;
  const ranged = type?.startsWith?.("r");
  const finesse = sys.properties?.fin || sys.properties?.finesse;
  return (ranged || finesse) ? "dex" : "str";
}

// Parse "XdY" → {n, f} else null
function parseDie(expr) {
  const m = /^\s*(\d+)d(\d+)\s*$/i.exec(expr || "");
  return m ? { n: Number(m[1]), f: Number(m[2]) } : null;
}

// Brutal value from item, trying several shapes
function getBrutal(item) {
  const sys = item.system ?? {};
  const p = sys.properties ?? {};
  if (typeof p.brutal === "number") return p.brutal;
  if (p.brutal === true) return 1;
  const b = sys.brutal ?? sys.brutal?.value;
  const n = Number(b);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Build base damage parts from item: array of {formula, type}
function getWeaponDamageParts(item) {
  const parts = (item.system?.damage?.parts || []).map(([f, t]) => ({ formula: String(f), type: String(t || "—") }));
  return parts;
}

// Double dice for crit, then add brutal dice AFTER doubling on the primary die
function applyCritAndBrutal(parts, brutal) {
  if (!parts?.length) return parts;

  // Double dice count on each NdX component
  const doubled = parts.map(p => {
    // split by + and transform each simple NdX; leave constants as-is
    const tokens = p.formula.split("+").map(s => s.trim()).filter(Boolean);
    const newTokens = tokens.map(tok => {
      const die = parseDie(tok);
      if (!die) return tok;               // not an NdX
      return `${die.n * 2}d${die.f}`;     // double number of dice
    });
    return { ...p, formula: newTokens.join(" + ") };
  });

  if (brutal > 0) {
    // Add brutal dice equal to brutal *primary* die (first die we can parse in first part)
    const first = doubled[0];
    const firstDieTok = first.formula.split("+").map(s => s.trim()).find(tok => parseDie(tok));
    const die = parseDie(firstDieTok || "");
    if (die) {
      const add = `${brutal}d${die.f}`;
      const f = first.formula.trim();
      doubled[0] = { ...first, formula: f ? `${f} + ${add}` : add };
    }
  }

  return doubled;
}

export async function rollDamage({ actor, weaponId, state }) {
  const item = getWeaponById(actor.actor, weaponId);
  if (!item) return ui.notifications.warn("No weapon selected.");

  const abilityKey = state.ability || deriveDefaultAbility(item);
  const usingSmart = !!state.smart;

  const abilityMod = usingSmart ? Number(state.smartAbility ?? 0)
                                : (actor.abilities?.[abilityKey]?.mod ?? 0);

  // Base weapon parts
  let parts = getWeaponDamageParts(item);

  // Crit handling (double dice, then brutal)
  if (state.crit) {
    parts = applyCritAndBrutal(parts, getBrutal(item));
  }

  // Compose damage formula: sum parts + ability mod (once) + extra user mods
  const formulas = parts.map(p => p.formula);
  if (abilityMod) formulas.push(signed(abilityMod));

  let extra = (state.dmgMods || "").trim();
  if (extra) {
    if (!/^[+\-]/.test(extra)) extra = `+ (${extra})`;
    formulas.push(extra);
  }

  const formula = formulas.join(" ");
  const R = Roll;                                 // Use plain Roll so DSN shows actual dice
  const data = actor.actor.getRollData?.() ?? {};
  const targets = Array.from(game.user?.targets ?? []);

  const makeRoll = async () => {
    const r = new R(formula, data);
    if (typeof r.evaluate === "function") await r.evaluate({ async: true });
    else if (typeof r.roll === "function") await r.roll({ async: true });
    return r;
  };

  // Build single combined card (one roll shared, or one per target if separate)
  const lines = [];
  const rolls = [];

  if (state.separate && targets.length > 1) {
    for (const t of targets) {
      const r = await makeRoll();
      rolls.push(r);
      lines.push(
        `<li><a class="sw5e-helper-target" data-scene="${canvas.scene?.id}" data-token="${t.id}">${t.name}</a>: <b>${r.total}</b>${state.crit ? " (CRIT)" : ""}</li>`
      );
    }
  } else {
    const r = await makeRoll();
    rolls.push(r);
    if (targets.length) {
      for (const t of targets) {
        lines.push(
          `<li><a class="sw5e-helper-target" data-scene="${canvas.scene?.id}" data-token="${t.id}">${t.name}</a>: <b>${r.total}</b>${state.crit ? " (CRIT)" : ""}</li>`
        );
      }
    }
  }

  // Header & details
  const header = `${item.name} — Damage · ${state.adv.toUpperCase()}${state.crit ? " · CRIT" : ""}`;
  const sub = `<small>${abilityKey.toUpperCase()} ${signed(abilityMod)}</small>`;
  const list = lines.length ? `<ul style="margin:.5em 1em;">${lines.join("")}</ul>` : "";
  const formulaHtml = `<code>${formula}</code>`;

  // GM-only debug
  const gmDebug = game.user?.isGM
    ? `<details style="margin-top:.4em;"><summary>Debug</summary>
         <div style="font-family:monospace;font-size:11px;">
           crit=${!!state.crit}, adv="${state.adv}" (does not change damage dice)<br/>
           ability=${abilityKey} (${signed(abilityMod)})<br/>
           baseParts=[${getWeaponDamageParts(item).map(p => p.formula).join(" + ")}], brutal=${getBrutal(item)}
         </div>
       </details>`
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor.actor }),
    flavor: `${header}<div>${sub}<br>${formulaHtml}</div>${list}${gmDebug}`,
    type: (CONST?.CHAT_MESSAGE_TYPES?.ROLL ?? 5),
    rolls
  });
}
