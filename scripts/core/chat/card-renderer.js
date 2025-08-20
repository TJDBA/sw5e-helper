// scripts/core/chat/card-renderer.js
const MOD = "sw5e-helper";

/**
 * Render the attack card HTML from state.
 * Only visuals + data-action hooks here (no logic).
 * @param {object} state  message.flags[MOD].state
 * @param {object} ctx    { isGM:boolean, isOwner:boolean, localize:fn }
 */
export function renderAttackCard(state, ctx = {}) {
  const l = (k) => (game.i18n?.localize?.(k) ?? k);
  const isGM = ctx.isGM ?? game.user.isGM;
  const youAreAuthor = state.authorId === game.user.id;

  const advBadge = state.options?.adv && state.options.adv !== "normal"
    ? ` (${state.options.adv.toUpperCase()})` : "";

  // Header actions (right side)
  const hdrActions = (youAreAuthor || isGM) ? `
    <span class="icons hdr-icons">
      <a class="icon-btn" data-action="card-quick-damage" title="${l("SW5EHELPER.QuickDamage")}" aria-label="${l("SW5EHELPER.QuickDamage")}">⚡</a>
      <a class="icon-btn" data-action="card-mod-damage"   title="${l("SW5EHELPER.ModDamage")}"   aria-label="${l("SW5EHELPER.ModDamage")}">🎲</a>
    </span>` : "";

  const expandToggles = `
    <div class="row-toggles">
      <a data-action="expand-all">${l("SW5EHELPER.ExpandAll")}</a> |
      <a data-action="collapse-all">${l("SW5EHELPER.CollapseAll")}</a>
    </div>`;

  const rows = (state.targets ?? []).map(t => {
    const saveOnly = !!state.options?.saveOnly;

    const status = saveOnly
      ? `<span class="badge save-required">${l("SW5EHELPER.SaveRequired")}</span>`
      : (t.attack ? `<span class="attack-roll">${t.attack.kept ?? ""} (${t.attack.total ?? ""})</span>
         <span class="badge status-${t.attack.status}">${t.attack.status?.toUpperCase?.() ?? ""}</span>` : "");

    // Right side of summary: damage or dash, then apply icons or ✓
    const dmgSummary = (t.damage?.total != null)
      ? `💥 ${t.damage.total}`
      : (saveOnly ? "—" : "—");

    const appliedSummary = t.damage?.applied
      ? ` <span class="applied-check">✓</span>`
      : ((youAreAuthor || isGM || t.isOwner) ? ` 
          <span class="icons sum-icons">
            <a class="icon-btn" data-action="apply-full" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ApplyFull")}" aria-label="${l("SW5EHELPER.ApplyFull")}">💯</a>
            <a class="icon-btn" data-action="apply-half" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ApplyHalf")}" aria-label="${l("SW5EHELPER.ApplyHalf")}">½</a>
            <a class="icon-btn" data-action="apply-none" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ApplyNone")}" aria-label="${l("SW5EHELPER.ApplyNone")}">∅</a>
          </span>` : "");

    const saveBlock = (t.save || state.options?.save) ? `
      <div class="save-block">
        ${(t.save?.abi ?? state.options?.save?.ability ?? "").toString().toUpperCase()}
        | ${l("SW5EHELPER.SaveDC")}: ${(t.save?.dc ?? state.options?.save?.dc ?? state.options?.save?.dcFormula ?? "—")}
        ${t.save?.total != null
          ? `| ${t.save.total} (${t.save.success ? l("SW5EHELPER.Success") : l("SW5EHELPER.Fail")})`
          : `| <a class="mini-btn" data-action="roll-save" data-target-ref="${t.sceneId}:${t.tokenId}">${l("SW5EHELPER.RollSave")}</a>`
        }
      </div>` : "";

    const damageBlock = `
      <div class="damage-block">
        <span class="info-icon" data-action="show-damage-formula" title="${l("SW5EHELPER.DamageFormulaTooltip")}">ⓘ</span>
        <div class="damage-line">
          <span>${l("SW5EHELPER.Damage")}:</span>
          <span class="dmg-val">${t.damage?.total ?? "—"}</span>
          ${!t.damage?.applied ? `
            <span class="icons">
              <a class="icon-btn" data-action="row-mod-damage" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ModDamage")}" aria-label="${l("SW5EHELPER.ModDamage")}">🎲</a>
              <a class="icon-btn" data-action="apply-full" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ApplyFull")}" aria-label="${l("SW5EHELPER.ApplyFull")}">💯</a>
              <a class="icon-btn" data-action="apply-half" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ApplyHalf")}" aria-label="${l("SW5EHELPER.ApplyHalf")}">½</a>
              <a class="icon-btn" data-action="apply-none" data-target-ref="${t.sceneId}:${t.tokenId}" title="${l("SW5EHELPER.ApplyNone")}" aria-label="${l("SW5EHELPER.ApplyNone")}">∅</a>
            </span>` : `
            <span class="applied-pill">${l("SW5EHELPER.Applied")}: ${t.damage.applied.value} (${t.damage.applied.mode}) ✓</span>
          `}
        </div>
      </div>`;

    return `
    <details class="target-row" data-target="${t.sceneId}:${t.tokenId}" ${t.removed ? 'data-removed="true"' : ""}>
      <summary>
        <img src="${t.img ?? ""}" class="portrait" data-action="ping-select" data-target-ref="${t.sceneId}:${t.tokenId}" />
        <span class="name" data-action="ping-select" data-target-ref="${t.sceneId}:${t.tokenId}">${t.name ?? ""}</span>
        ${status}
        <span class="summary-right">${dmgSummary}${appliedSummary}</span>
      </summary>
      <div class="row-body">
        ${saveBlock}
        ${damageBlock}
      </div>
    </details>`;
  }).join("");

  // Optional GM toolbar (text, small; can iconize later)
  const gmToolbar = isGM ? `
    <div class="gm-toolbar">
      <a class="mini-btn" data-action="gm-roll-all-saves">${l("SW5EHELPER.RollAllSaves")}</a>
      <a class="mini-btn" data-action="gm-apply-all-full">${l("SW5EHELPER.ApplyAllFull")}</a>
    </div>` : "";

  return `
  <div class="sw5e-helper-card" data-message-id="${state.messageId ?? ""}">
    <div class="weapon-banner">
      <img src="${state.weaponImg ?? ""}" alt="Weapon" class="weapon-icon" />
      <div class="weapon-title">
        <span class="name">${state.itemName ?? ""} — ${l("SW5EHELPER.RollAttack").replace(l("SW5EHELPER.RollAttack"), "Attack")}${advBadge}</span>
        <span class="info-icon" data-action="show-attack-formula" title="${l("SW5EHELPER.AttackFormulaTooltip")}">ⓘ</span>
      </div>
      ${hdrActions}
    </div>
    ${gmToolbar}
    ${expandToggles}
    ${rows}
  </div>`;
}
