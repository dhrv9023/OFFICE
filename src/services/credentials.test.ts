import { describe, expect, it } from 'vitest';
import { createSessionCredentialVault } from './credentials';

describe('session credential vault', () => {
  it('holds keys in memory only, lists providers but never their keys', () => {
    const vault = createSessionCredentialVault();
    expect(vault.get('p')).toBeNull();
    vault.set('p', 'secret-1');
    expect(vault.get('p')).toBe('secret-1');
    expect(vault.providers()).toEqual(['p']);
    expect(JSON.stringify(vault.providers())).not.toContain('secret-1');
    vault.forget('p');
    expect(vault.get('p')).toBeNull();
    expect(() => {
      vault.set('p', '  ');
    }).toThrow();
  });
});
