export type DocFormat = "pdf" | "docx";

const KEY = "dgv:preferred_format";

/** Последно избраният формат за сваляне (по подразбиране PDF). */
export function getPreferredFormat(): DocFormat {
  try {
    const v = localStorage.getItem(KEY);
    return v === "docx" ? "docx" : "pdf";
  } catch {
    return "pdf";
  }
}

/** Запомня формата, за да е първа опция при следващото сваляне. */
export function setPreferredFormat(format: DocFormat) {
  try {
    localStorage.setItem(KEY, format);
  } catch {
    /* ignore */
  }
}
