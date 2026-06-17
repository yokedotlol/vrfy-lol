import { describe, test, expect } from 'bun:test';
import { validateSyntax } from '../src/validators/syntax';

describe('Syntax Validation', () => {
  // ─── Valid addresses ───
  test('standard email', () => {
    const r = validateSyntax('user@example.com');
    expect(r.valid).toBe(true);
    expect(r.local_part).toBe('user');
    expect(r.domain).toBe('example.com');
    expect(r.is_internationalized).toBe(false);
  });

  test('plus-addressed email', () => {
    const r = validateSyntax('user+tag@example.com');
    expect(r.valid).toBe(true);
    expect(r.local_part).toBe('user+tag');
  });

  test('special characters in local part', () => {
    expect(validateSyntax('_@example.com').valid).toBe(true);
    expect(validateSyntax('$A12345@example.com').valid).toBe(true);
    expect(validateSyntax("user!def@example.com").valid).toBe(true);
    expect(validateSyntax("user#hash@example.com").valid).toBe(true);
  });

  test('quoted local part', () => {
    const r = validateSyntax('"john doe"@example.com');
    expect(r.valid).toBe(true);
    expect(r.is_quoted_local).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test('IP literal domain', () => {
    const r = validateSyntax('user@[192.168.1.1]');
    expect(r.valid).toBe(true);
    expect(r.is_ip_literal).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test('domain is lowercased', () => {
    const r = validateSyntax('User@EXAMPLE.COM');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('example.com');
    expect(r.local_part).toBe('User'); // local part case preserved
  });

  test('trims whitespace', () => {
    const r = validateSyntax('  user@example.com  ');
    expect(r.valid).toBe(true);
  });

  // ─── Invalid addresses ───
  test('empty input', () => {
    expect(validateSyntax('').valid).toBe(false);
    expect(validateSyntax('   ').valid).toBe(false);
  });

  test('no @ symbol', () => {
    const r = validateSyntax('userexample.com');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('@');
  });

  test('empty local part', () => {
    expect(validateSyntax('@example.com').valid).toBe(false);
  });

  test('empty domain', () => {
    expect(validateSyntax('user@').valid).toBe(false);
  });

  test('domain with only one label', () => {
    expect(validateSyntax('user@localhost').valid).toBe(false);
  });

  test('domain starting with hyphen', () => {
    expect(validateSyntax('user@-example.com').valid).toBe(false);
  });

  test('domain ending with hyphen', () => {
    expect(validateSyntax('user@example-.com').valid).toBe(false);
  });

  test('consecutive dots in local part', () => {
    expect(validateSyntax('user..name@example.com').valid).toBe(false);
  });

  test('local part starting with dot', () => {
    expect(validateSyntax('.user@example.com').valid).toBe(false);
  });

  test('local part ending with dot', () => {
    expect(validateSyntax('user.@example.com').valid).toBe(false);
  });

  test('address too long', () => {
    const longLocal = 'a'.repeat(64);
    const longDomain = 'b'.repeat(63) + '.com';
    // This should be valid at 64+1+67 = 132 chars
    expect(validateSyntax(`${longLocal}@${longDomain}`).valid).toBe(true);

    // But 255 chars is too long
    const tooLong = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(60) + '.com';
    expect(validateSyntax(tooLong).valid).toBe(false);
  });

  test('all-numeric TLD rejected', () => {
    expect(validateSyntax('user@example.123').valid).toBe(false);
  });

  test('IDN domain (internationalized)', () => {
    const r = validateSyntax('user@münchen.de');
    expect(r.valid).toBe(true);
    expect(r.is_internationalized).toBe(true);
  });
});

describe('Disposable Detection', () => {
  const { isDisposableDomain } = require('../src/data/disposable');

  test('known disposable domains', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true);
    expect(isDisposableDomain('guerrillamail.com')).toBe(true);
    expect(isDisposableDomain('yopmail.com')).toBe(true);
  });

  test('legitimate domains not flagged', () => {
    expect(isDisposableDomain('gmail.com')).toBe(false);
    expect(isDisposableDomain('yahoo.com')).toBe(false);
    expect(isDisposableDomain('outlook.com')).toBe(false);
  });

  test('subdomain matching', () => {
    expect(isDisposableDomain('anything.guerrillamail.com')).toBe(true);
    expect(isDisposableDomain('sub.mailinator.com')).toBe(true);
  });
});

describe('Privacy Relay', () => {
  const { getPrivacyRelayService, isPrivacyRelayDomain } = require('../src/data/privacy-relays');

  test('Apple Hide My Email', () => {
    expect(getPrivacyRelayService('privaterelay.appleid.com')).toBe('Apple Hide My Email');
    expect(isPrivacyRelayDomain('privaterelay.appleid.com')).toBe(true);
  });

  test('DuckDuckGo Email', () => {
    expect(getPrivacyRelayService('duck.com')).toBe('DuckDuckGo Email');
  });

  test('Firefox Relay', () => {
    expect(getPrivacyRelayService('mozmail.com')).toBe('Firefox Relay');
  });

  test('SimpleLogin', () => {
    expect(getPrivacyRelayService('simplelogin.co')).toBe('SimpleLogin');
  });

  test('regular domains not flagged', () => {
    expect(getPrivacyRelayService('gmail.com')).toBeNull();
    expect(isPrivacyRelayDomain('example.com')).toBe(false);
  });
});

describe('Free Provider Detection', () => {
  const { isFreeProvider } = require('../src/data/free-providers');

  test('major free providers', () => {
    expect(isFreeProvider('gmail.com')).toBe(true);
    expect(isFreeProvider('yahoo.com')).toBe(true);
    expect(isFreeProvider('hotmail.com')).toBe(true);
    expect(isFreeProvider('outlook.com')).toBe(true);
    expect(isFreeProvider('protonmail.com')).toBe(true);
  });

  test('custom domains not flagged', () => {
    expect(isFreeProvider('example.com')).toBe(false);
    expect(isFreeProvider('mycompany.io')).toBe(false);
  });

  test('case insensitive', () => {
    expect(isFreeProvider('Gmail.com')).toBe(true);
    expect(isFreeProvider('YAHOO.COM')).toBe(true);
  });
});

describe('Role Account Detection', () => {
  const { isRoleAccount } = require('../src/data/role-accounts');

  test('RFC 2142 roles', () => {
    expect(isRoleAccount('postmaster')).toBe(true);
    expect(isRoleAccount('abuse')).toBe(true);
    expect(isRoleAccount('webmaster')).toBe(true);
    expect(isRoleAccount('security')).toBe(true);
  });

  test('common functional accounts', () => {
    expect(isRoleAccount('admin')).toBe(true);
    expect(isRoleAccount('billing')).toBe(true);
    expect(isRoleAccount('noreply')).toBe(true);
    expect(isRoleAccount('no-reply')).toBe(true);
    expect(isRoleAccount('hr')).toBe(true);
  });

  test('personal names not flagged', () => {
    expect(isRoleAccount('john')).toBe(false);
    expect(isRoleAccount('sarah.smith')).toBe(false);
    expect(isRoleAccount('kpayne')).toBe(false);
  });
});

describe('Typo Detection', () => {
  const { detectTypo, levenshteinDistance } = require('../src/validators/typo');

  test('curated map matches', () => {
    expect(detectTypo('gmial.com').has_typo).toBe(true);
    expect(detectTypo('gmial.com').suggested_domain).toBe('gmail.com');

    expect(detectTypo('hotmial.com').has_typo).toBe(true);
    expect(detectTypo('hotmial.com').suggested_domain).toBe('hotmail.com');

    expect(detectTypo('yaho.com').has_typo).toBe(true);
    expect(detectTypo('yaho.com').suggested_domain).toBe('yahoo.com');
  });

  test('valid domains not flagged', () => {
    expect(detectTypo('gmail.com').has_typo).toBe(false);
    expect(detectTypo('yahoo.com').has_typo).toBe(false);
    expect(detectTypo('example.com').has_typo).toBe(false);
  });

  test('levenshtein distance calculation', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
    expect(levenshteinDistance('gmail.com', 'gmal.com')).toBe(1);
  });

  test('levenshtein fallback for unknown typos', () => {
    // gnail.com is in the curated map, but let's test a close one
    const r = detectTypo('gmaol.com');
    expect(r.has_typo).toBe(true);
    expect(r.suggested_domain).toBe('gmail.com');
  });
});

describe('Provider Identification', () => {
  const { identifyProvider } = require('../src/data/providers');

  test('Google from MX', () => {
    const p = identifyProvider(['aspmx.l.google.com', 'alt1.aspmx.l.google.com']);
    expect(p).not.toBeNull();
    expect(p!.name).toContain('Google');
  });

  test('Microsoft from MX', () => {
    const p = identifyProvider(['example-com.mail.protection.outlook.com']);
    expect(p).not.toBeNull();
    expect(p!.name).toContain('Microsoft');
  });

  test('Proton from MX', () => {
    const p = identifyProvider(['mail.protonmail.ch']);
    expect(p).not.toBeNull();
    expect(p!.name).toContain('Proton');
  });

  test('unknown MX returns null', () => {
    expect(identifyProvider(['mx.unknowndomain.xyz'])).toBeNull();
  });

  test('trailing dot stripped', () => {
    const p = identifyProvider(['aspmx.l.google.com.']);
    expect(p).not.toBeNull();
    expect(p!.name).toContain('Google');
  });
});

describe('Subaddress Detection', () => {
  const { detectSubaddress } = require('../src/validators/subaddress');

  test('Gmail plus addressing', () => {
    const r = detectSubaddress('user+tag', 'gmail.com');
    expect(r.is_subaddressed).toBe(true);
    expect(r.tag).toBe('tag');
    expect(r.base_address).toBe('user@gmail.com');
  });

  test('no subaddress', () => {
    const r = detectSubaddress('user', 'gmail.com');
    expect(r.is_subaddressed).toBe(false);
    expect(r.tag).toBeNull();
  });

  test('plus addressing on unknown domain still detected', () => {
    const r = detectSubaddress('user+newsletter', 'mycompany.com');
    expect(r.is_subaddressed).toBe(true);
    expect(r.tag).toBe('newsletter');
  });
});

describe('Action Field', () => {
  const { determineAction } = require('../src/validators/action');

  const validMx = {
    has_mx: true, mx_records: [{ priority: 1, host: 'mx.example.com' }],
    null_mx: false, domain_exists: true, has_a_fallback: false, error: null,
  };

  const noMx = {
    has_mx: false, mx_records: [],
    null_mx: false, domain_exists: false, has_a_fallback: false, error: null,
  };

  const nullMx = {
    has_mx: false, mx_records: [],
    null_mx: true, domain_exists: true, has_a_fallback: false, error: null,
  };

  test('allow for valid email', () => {
    expect(determineAction({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('allow');
  });

  test('block for invalid syntax', () => {
    expect(determineAction({
      syntax_valid: false, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('block');
  });

  test('block for disposable', () => {
    expect(determineAction({
      syntax_valid: true, mx: validMx,
      is_disposable: true, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('block');
  });

  test('block for non-existent domain', () => {
    expect(determineAction({
      syntax_valid: true, mx: noMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('block');
  });

  test('block for null MX', () => {
    expect(determineAction({
      syntax_valid: true, mx: nullMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('block');
  });

  test('verify for privacy relay', () => {
    expect(determineAction({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: true,
      is_role_account: false, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('verify');
  });

  test('verify for typo', () => {
    expect(determineAction({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      has_typo: true, catch_all_likely: false,
    })).toBe('verify');
  });

  test('verify for role account', () => {
    expect(determineAction({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: true, is_free_provider: false,
      has_typo: false, catch_all_likely: false,
    })).toBe('verify');
  });
});

describe('Confidence Classification', () => {
  const { classifyConfidence } = require('../src/validators/confidence');

  const validMx = {
    has_mx: true, mx_records: [{ priority: 1, host: 'mx.example.com' }],
    null_mx: false, domain_exists: true, has_a_fallback: false, error: null,
  };

  test('invalid for bad syntax', () => {
    expect(classifyConfidence({
      syntax_valid: false, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      provider: null, has_typo: false,
    })).toBe('invalid');
  });

  test('valid for known provider + MX', () => {
    expect(classifyConfidence({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      provider: { name: 'Google Workspace', is_free: false, catch_all_default: true, smtp_verification: 'unreliable', note: '' },
      has_typo: false,
    })).toBe('valid');
  });

  test('valid for free provider + MX', () => {
    expect(classifyConfidence({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: true,
      provider: null, has_typo: false,
    })).toBe('valid');
  });

  test('risky for disposable', () => {
    expect(classifyConfidence({
      syntax_valid: true, mx: validMx,
      is_disposable: true, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      provider: null, has_typo: false,
    })).toBe('risky');
  });

  test('likely_valid for MX without provider match', () => {
    expect(classifyConfidence({
      syntax_valid: true, mx: validMx,
      is_disposable: false, is_privacy_relay: false,
      is_role_account: false, is_free_provider: false,
      provider: null, has_typo: false,
    })).toBe('likely_valid');
  });
});
