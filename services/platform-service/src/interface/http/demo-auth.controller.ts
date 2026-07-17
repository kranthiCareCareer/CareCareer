import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Demo-only authentication endpoint.
 * Issues signed JWTs for persona selection in the admin console.
 *
 * MUST be disabled in production (checked via DEMO_AUTH_ENABLED env var).
 */
@Controller('demo')
@Public()
export class DemoAuthController {
  private readonly secret: string;
  private readonly enabled: boolean;

  constructor() {
    this.secret =
      process.env['DEMO_AUTH_SECRET'] ??
      'carecareer-demo-secret-for-testing-only-do-not-use-in-production';
    this.enabled = process.env['DEMO_AUTH_ENABLED'] !== 'false';
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  issueToken(@Body() body: { sub?: string; tenantId?: string; role?: string }): { token: string } {
    if (!this.enabled) {
      throw new BadRequestException('Demo authentication is disabled in this environment');
    }

    const { sub, tenantId, role } = body;
    if (!sub || !tenantId || !role) {
      throw new BadRequestException('sub, tenantId, and role are required');
    }

    const token = this.signToken(sub, tenantId, role);
    return { token };
  }

  private signToken(sub: string, tenantId: string, role: string): string {
    // Use the same signing approach as the testing package
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: 'carecareer-demo',
      aud: 'carecareer-api',
      sub,
      actor_id: sub,
      actor_type: 'user',
      tenants: [
        {
          tenantId,
          roles: [role],
          branchIds: [],
          status: 'active',
        },
      ],
      iat: now,
      exp: now + 900, // 15 minutes
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
