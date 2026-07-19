import { describe, it, expect } from 'vitest';

import { createExternalIdentity } from './external-identity.js';

describe('ExternalIdentity Domain', () => {
  describe('createExternalIdentity', () => {
    it('should create an external identity with normalized values', () => {
      const identity = createExternalIdentity({
        id: '22222222-2222-2222-2222-222222222222',
        userId: '11111111-1111-1111-1111-111111111111',
        issuer: '  https://login.microsoftonline.com/tenant  ',
        subject: '  user-subject-123  ',
        providerType: 'entra',
        emailClaim: '  User@Example.COM  ',
        displayNameClaim: '  John Doe  ',
      });

      expect(identity.id).toBe('22222222-2222-2222-2222-222222222222');
      expect(identity.userId).toBe('11111111-1111-1111-1111-111111111111');
      expect(identity.issuer).toBe('https://login.microsoftonline.com/tenant');
      expect(identity.subject).toBe('user-subject-123');
      expect(identity.providerType).toBe('entra');
      expect(identity.emailClaim).toBe('user@example.com');
      expect(identity.displayNameClaim).toBe('John Doe');
      expect(identity.lastAuthenticatedAt).toBeNull();
    });

    it('should handle null email and display name claims', () => {
      const identity = createExternalIdentity({
        id: '22222222-2222-2222-2222-222222222222',
        userId: '11111111-1111-1111-1111-111111111111',
        issuer: 'https://accounts.google.com',
        subject: 'google-sub-456',
        providerType: 'auth0',
      });

      expect(identity.emailClaim).toBeNull();
      expect(identity.displayNameClaim).toBeNull();
    });

    it('should allow multiple identities for same user (different issuers)', () => {
      const entraIdentity = createExternalIdentity({
        id: '22222222-2222-2222-2222-222222222221',
        userId: '11111111-1111-1111-1111-111111111111',
        issuer: 'https://login.microsoftonline.com/tenant-a',
        subject: 'entra-sub',
        providerType: 'entra',
        emailClaim: 'user@company.com',
      });

      const oktaIdentity = createExternalIdentity({
        id: '22222222-2222-2222-2222-222222222222',
        userId: '11111111-1111-1111-1111-111111111111',
        issuer: 'https://company.okta.com',
        subject: 'okta-sub',
        providerType: 'okta',
        emailClaim: 'user@company.com',
      });

      // Same user, same email, different issuers → separate identities
      expect(entraIdentity.userId).toBe(oktaIdentity.userId);
      expect(entraIdentity.emailClaim).toBe(oktaIdentity.emailClaim);
      expect(entraIdentity.issuer).not.toBe(oktaIdentity.issuer);
      expect(entraIdentity.id).not.toBe(oktaIdentity.id);
    });
  });
});
