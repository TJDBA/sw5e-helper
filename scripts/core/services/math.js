export function applyCritToDiceOnly(formula) {
  return String(formula).replace(/(\d+)d(\d+)/gi, (m, n, d) => `${Number(n) * 2}d${d}`);
}

export function addBrutalDiceAfterCrit(parts, brutal) {
  if (!brutal) return parts.map(p => [...p]);
  const out = parts.map(p => [...p]);
  const primary = out.find(p => p[2]);
  if (!primary) return out;

  const match = primary[0].match(/(\d+)d(\d+)/i);
  const die = match?.[2];
  if (!die) return out;

  primary[0] = `${primary[0]} + ${brutal}d${die}`;
  return out;
}
