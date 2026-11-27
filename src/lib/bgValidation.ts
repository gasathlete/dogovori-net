// Български валидации за ЕГН и ЕИК (Булстат)

/**
 * Проверка на ЕГН по официалния алгоритъм:
 * - 10 цифри
 * - валидна дата на раждане (включва +40/+80 за кодиране на век)
 * - контролна цифра по тегла [2,4,8,5,10,9,7,3,6], mod 11 (10 → 0)
 */
export function isValidEGN(egn: string): boolean {
  if (!/^\d{10}$/.test(egn)) return false;
  const d = egn.split("").map(Number);

  let yy = d[0] * 10 + d[1];
  let mm = d[2] * 10 + d[3];
  const dd = d[4] * 10 + d[5];

  let year: number;
  if (mm >= 41 && mm <= 52) { year = 2000 + yy; mm -= 40; }
  else if (mm >= 21 && mm <= 32) { year = 1800 + yy; mm -= 20; }
  else if (mm >= 1 && mm <= 12) { year = 1900 + yy; }
  else return false;

  const date = new Date(year, mm - 1, dd);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) return false;

  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * weights[i];
  let check = sum % 11;
  if (check === 10) check = 0;
  return check === d[9];
}

/**
 * Проверка на ЕИК (Булстат) — 9 или 13 цифри.
 * Алгоритъм: https://www.bulstat.bg/ (официална формула)
 */
export function isValidEIK(eik: string): boolean {
  if (!/^\d{9}$|^\d{13}$/.test(eik)) return false;
  const d = eik.split("").map(Number);

  // Първа контролна цифра (позиция 9)
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8];
  let s1 = 0;
  for (let i = 0; i < 8; i++) s1 += d[i] * w1[i];
  let c1 = s1 % 11;
  if (c1 === 10) {
    const w1b = [3, 4, 5, 6, 7, 8, 9, 10];
    let s = 0;
    for (let i = 0; i < 8; i++) s += d[i] * w1b[i];
    c1 = s % 11;
    if (c1 === 10) c1 = 0;
  }
  if (c1 !== d[8]) return false;

  if (d.length === 9) return true;

  // 13-цифрен — допълнителна проверка
  const w2 = [2, 7, 3, 5];
  const w2b = [4, 9, 5, 7];
  let s2 = 0;
  for (let i = 0; i < 4; i++) s2 += d[8 + i] * w2[i];
  let c2 = s2 % 11;
  if (c2 === 10) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += d[8 + i] * w2b[i];
    c2 = s % 11;
    if (c2 === 10) c2 = 0;
  }
  return c2 === d[12];
}
