import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { createFacility, type Facility } from '../../domain/facility.js';
import type { StaffingRepository } from '../ports/staffing-repository.js';

/**
 * Input for the CreateFacility command.
 * All fields derived from validated request (never raw user input).
 */
export interface CreateFacilityInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly clientId: string;
  readonly name: string;
  readonly timezone: string;
  readonly addressLine1?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly geofenceRadiusMeters?: number | undefined;
}

export interface CreateFacilityResult {
  readonly facilityId: string;
}

/**
 * CreateFacility command handler.
 *
 * Atomically within one TenantAwareTransaction:
 * 1. Create facility aggregate
 * 2. Persist audit record
 * 3. Persist outbox event
 *
 * Failure in any step rolls back all changes.
 */
export class CreateFacilityHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: StaffingRepository,
  ) {}

  async execute(input: CreateFacilityInput): Promise<CreateFacilityResult> {
    const facility = createFacility({
      tenantId: input.tenantId,
      clientId: input.clientId,
      name: input.name,
      timezone: input.timezone,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
      zip: input.zip,
      latitude: input.latitude,
      longitude: input.longitude,
      geofenceRadiusMeters: input.geofenceRadiusMeters,
    });

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      await this.repo.createFacility(tx, facility);
      await this.emitAudit(tx, facility, input);
      await this.emitOutboxEvent(tx, facility, input);
    });

    return { facilityId: facility.id };
  }

  private async emitAudit(
    tx: TransactionClient,
    facility: Facility,
    input: CreateFacilityInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'facility.created'},
        ${'facility'}, ${facility.id}::uuid,
        ${JSON.stringify({
          name: facility.name,
          timezone: facility.timezone,
          clientId: facility.clientId,
          status: facility.status,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutboxEvent(
    tx: TransactionClient,
    facility: Facility,
    input: CreateFacilityInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.facility.created.v1'},
        ${'facility'}, ${facility.id}::uuid,
        ${JSON.stringify({
          facilityId: facility.id,
          tenantId: facility.tenantId,
          clientId: facility.clientId,
          name: facility.name,
          timezone: facility.timezone,
          status: facility.status,
          geofenceVersion: facility.geofenceVersion,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
