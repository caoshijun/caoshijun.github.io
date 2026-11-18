export const languages = [
  ['en','English'],['zh','中文'],['de','Deutsch'],['fr','Français'],
  ['ja','日本語'],['ko','한국어'],['es','Español']
];
export function detectLanguage(preferred = [], saved = '') {
  const supported = new Set(languages.map(([code]) => code));
  if (supported.has(saved)) return saved;
  for (const value of preferred) {
    const code = String(value).toLowerCase().split(/[-_]/)[0];
    if (supported.has(code)) return code;
  }
  return 'en';
}
export function initialLanguage() {
  let saved = '';
  try { saved = localStorage.getItem('cwbsm-language') || localStorage.getItem('cwbsm-installer-language') || ''; } catch {}
  return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language],saved);
}
export function rememberLanguage(code) {
  if (!languages.some(([value]) => value === code)) return;
  try { localStorage.setItem('cwbsm-language',code); } catch {}
}
export function languageOptions(select) {
  select.replaceChildren(...languages.map(([code,name]) => new Option(name,code)));
}
