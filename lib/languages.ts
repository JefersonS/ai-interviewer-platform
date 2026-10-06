export type Lang = "en" | "pt-BR";

export const LANGUAGES: Record<Lang, { label: string; speech: string; promptName: string }> = {
  en: { label: "English", speech: "en-US", promptName: "English" },
  "pt-BR": { label: "Português (Brasil)", speech: "pt-BR", promptName: "Brazilian Portuguese" },
};

export const LANG_CODES = Object.keys(LANGUAGES) as Lang[];

export const isLang = (v: unknown): v is Lang => typeof v === "string" && Object.hasOwn(LANGUAGES, v);
