export function buildLookups(gameData) {
  const generalsById = Object.fromEntries((gameData.generals || []).map((g) => [g.id, g]));
  const supplyById = Object.fromEntries((gameData.supply || []).map((c) => [c.id, c]));
  const rolesById = Object.fromEntries((gameData.roles || []).map((r) => [r.id, r]));
  return { generalsById, supplyById, rolesById, infantry: gameData.infantry };
}

export const ICON_LABEL = {
  action: { th: 'ใช้เป็นการกระทำในตา', en: 'Usable as one of your turn actions', symbol: '🔥' },
  trigger: { th: 'ทำงานอัตโนมัติเมื่อเข้าเงื่อนไข', en: 'Triggers automatically', symbol: '❗' },
  continuous: { th: 'พาสซีฟ ทำงานตลอดเวลา', en: 'Always-on passive', symbol: '♾️' }
};

export const ROLE_LABEL_TH = {
  royal: 'ราชสำนัก',
  marshal: 'แม่ทัพ',
  vicemarshal: 'รองแม่ทัพ',
  invader: 'พวกนอกด่าน',
  rebel: 'โจรกบฏ'
};
