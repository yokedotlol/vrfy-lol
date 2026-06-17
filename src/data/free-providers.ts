// ─── Free email provider list ───
// Services that offer free personal email accounts.
// Used for B2B SaaS "use your business email" prompts and lead scoring.

export const FREE_PROVIDERS = new Set<string>([
  // Big 3
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',

  // Microsoft legacy
  'msn.com',
  'passport.com',

  // AOL/Yahoo family
  'aol.com',
  'aim.com',
  'ymail.com',
  'rocketmail.com',

  // Privacy-focused
  'protonmail.com',
  'proton.me',
  'pm.me',
  'tutanota.com',
  'tuta.io',
  'tutamail.com',

  // Apple
  'icloud.com',
  'me.com',
  'mac.com',

  // Misc international
  'mail.com',
  'email.com',
  'zoho.com',
  'zohomail.com',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'bk.ru',
  'inbox.ru',
  'list.ru',
  'rambler.ru',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'web.de',
  't-online.de',
  'freenet.de',

  // Asia
  'qq.com',
  '163.com',
  '126.com',
  'yeah.net',
  'sina.com',
  'naver.com',
  'daum.net',
  'hanmail.net',

  // Other
  'fastmail.com',
  'fastmail.fm',
  'hushmail.com',
  'mailfence.com',
  'runbox.com',
  'posteo.de',
  'posteo.net',
  'disroot.org',
  'cock.li',
  'airmail.cc',
  'lycos.com',
  'inbox.com',
  'lavabit.com',
  'rediffmail.com',
  'virgilio.it',
  'libero.it',
  'laposte.net',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'sfr.fr',
  'ntlworld.com',
  'btinternet.com',
  'sky.com',
  'talktalk.net',
  'comcast.net',
  'verizon.net',
  'att.net',
  'sbcglobal.net',
  'bellsouth.net',
  'cox.net',
  'charter.net',
  'earthlink.net',
  'juno.com',
  'optonline.net',

  // Temporary-looking but actually free providers
  'protonmail.ch',
  'pm.me',
]);

export function isFreeProvider(domain: string): boolean {
  return FREE_PROVIDERS.has(domain.toLowerCase());
}
