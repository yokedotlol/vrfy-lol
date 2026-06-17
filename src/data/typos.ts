// ─── Typo correction map ───
// Curated map of common email domain misspellings.
// Keys are lowercase misspelled domains, values are corrections.

export const TYPO_MAP: Record<string, string> = {
  // Gmail typos
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.cpm': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gnmail.com': 'gmail.com',
  'gmailcom': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmaio.com': 'gmail.com',
  'gmaip.com': 'gmail.com',

  // Yahoo typos
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.om': 'yahoo.com',
  'yaho.co': 'yahoo.com',
  'tahoo.com': 'yahoo.com',
  'uahoo.com': 'yahoo.com',
  'yahooc.om': 'yahoo.com',

  // Hotmail typos
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'htmail.com': 'hotmail.com',
  'htomail.com': 'hotmail.com',
  'hotmeil.com': 'hotmail.com',

  // Outlook typos
  'outlok.com': 'outlook.com',
  'outloook.com': 'outlook.com',
  'outlool.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'outlookk.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.cm': 'outlook.com',
  'outook.com': 'outlook.com',
  'outlooc.com': 'outlook.com',
  'putlook.com': 'outlook.com',
  'oultook.com': 'outlook.com',

  // iCloud typos
  'icoud.com': 'icloud.com',
  'iclould.com': 'icloud.com',
  'icluod.com': 'icloud.com',
  'icolud.com': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icloud.cm': 'icloud.com',
  'icloude.com': 'icloud.com',

  // Protonmail typos
  'protonmal.com': 'protonmail.com',
  'protonmial.com': 'protonmail.com',
  'protonmaill.com': 'protonmail.com',
  'protonmail.con': 'protonmail.com',
  'protomail.com': 'protonmail.com',
  'protommail.com': 'protonmail.com',
  'protonmai.com': 'protonmail.com',
  'protonmall.com': 'protonmail.com',

  // AOL typos
  'aol.con': 'aol.com',
  'aol.cm': 'aol.com',
  'ao.com': 'aol.com',
  'aoll.com': 'aol.com',

  // Live typos
  'live.con': 'live.com',
  'live.cm': 'live.com',
  'ive.com': 'live.com',

  // Zoho typos
  'zho.com': 'zoho.com',
  'zoho.con': 'zoho.com',

  // Mail.com typos
  'mail.con': 'mail.com',
  'mail.cm': 'mail.com',
  'maill.com': 'mail.com',

  // Yandex typos
  'yandex.con': 'yandex.com',
  'yandx.com': 'yandex.com',

  // Common TLD typos (applied to popular domains)
  'gmail.cmo': 'gmail.com',
  'yahoo.cmo': 'yahoo.com',
  'hotmail.cmo': 'hotmail.com',
  'outlook.cmo': 'outlook.com',

  // .org typos
  'gmail.ogr': 'gmail.com',

  // GMX typos
  'gmx.con': 'gmx.com',
  'gmx.cm': 'gmx.com',

  // Fastmail typos
  'fastmal.com': 'fastmail.com',
  'fastmail.con': 'fastmail.com',
  'fstmail.com': 'fastmail.com',
};

/**
 * Top email provider domains for Levenshtein distance comparison.
 * When a domain isn't in the curated map, we check distance against these.
 */
export const TOP_PROVIDER_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'fastmail.com',
  'live.com',
  'msn.com',
  'me.com',
  'mac.com',
  'pm.me',
  'tutanota.com',
  'tuta.io',
];
