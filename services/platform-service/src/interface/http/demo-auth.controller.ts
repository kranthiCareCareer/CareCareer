import { createHmac } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';

import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Demo-only authentication endpoint.
 * Issues signed JWTs for persona selection in the admin console.
 *
 * Safety rules:
 * - Requires explicit DEMO_MODE=true
 * - Returns 404 when demo mode is off (does not reveal existence)
 * - Rejected entirely when NODE_ENV=production regardless of DEMO_MODE
 * - Uses a demo-only secret supplied via DEMO_AUTH_SECRET
 * - Never uses a production signing secret
 */
@Controller('demo')
export class DemoAuthController {
  private readonly secret: string;
  private readonly demoEnabled: boolean;

  constructor() {
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    const demoMode = process.env['DEMO_MODE'] === 'true';

    // Production always disables demo auth regardless of DEMO_MODE
    this.demoEnabled = nodeEnv !== 'production' && demoMode;

    this.secret = process.env['DEMO_AUTH_SECRET'] ?? '';
  }

  @Public()
  @Post('token')
  @HttpCode(HttpStatus.OK)
  issueToken(@Body() body: { sub?: string; tenantId?: string; role?: string }): { token: string } {
    if (!this.demoEnabled) {
      throw new NotFoundException();
    }

    if (!this.secret) {
      throw new NotFoundException();
    }

    const { sub, tenantId, role } = body;
    if (!sub || !tenantId || !role) {
      throw new BadRequestException('sub, tenantId, and role are required');
    }

    const token = this.signToken(sub, tenantId, role);
    return { token };
  }

  private signToken(sub: string, tenantId: string, role: string): string {
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
      exp: now + 900,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
