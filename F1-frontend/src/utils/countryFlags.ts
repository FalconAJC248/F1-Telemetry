const COUNTRY_CODES: Record<string, string> = {
  'Australia': 'au',
  'Austria': 'at',
  'Azerbaijan': 'az',
  'Bahrain': 'bh',
  'Belgium': 'be',
  'Brazil': 'br',
  'Canada': 'ca',
  'China': 'cn',
  'France': 'fr',
  'Germany': 'de',
  'Hungary': 'hu',
  'Italy': 'it',
  'Japan': 'jp',
  'Mexico': 'mx',
  'Monaco': 'mc',
  'Netherlands': 'nl',
  'Portugal': 'pt',
  'Qatar': 'qa',
  'Saudi Arabia': 'sa',
  'Singapore': 'sg',
  'Spain': 'es',
  'Turkey': 'tr',
  'UAE': 'ae',
  'Abu Dhabi': 'ae',
  'United Kingdom': 'gb',
  'United States': 'us',
};

export function flagUrl(country: string): string | null {
  const code = COUNTRY_CODES[country];
  return code ? `https://flagcdn.com/w40/${code}.png` : null;
}
