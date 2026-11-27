/** Quote a PostgREST filter value; punctuation stays data, never filter syntax. */
export function postgrestSubstring(value: string): string {
  return JSON.stringify(`%${value.replace(/[%*_]/g, " ")}%`);
}