import { TenantAwareTransaction } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import { isEntitled } from '../../domain/entitlement.js';
import { EntitlementRequiredError, InvalidFeatureValueError } from '../../domain/errors.js';
import {
  FEATURE_MODULE_REQUIREMENTS,
  validateFeatureValue,
  type FeatureKey,
} from '../../domain/feature-configuration.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

export interface UpdateFeatureInput {
  readonly tenantId: string;
  readonly featureKey: FeatureKey;
  readonly value: unknown;
  readonly actorId: string;
}

/**
 * Update a feature configuration for a tenant.
 * Validates: entitlement exists, value is valid for the feature type.
 */
export async function updateFeatureCommand(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: UpdateFeatureInput,
): Promise<void> {
  // Validate feature value type
  if (!validateFeatureValue(input.featureKey, input.value)) {
    throw new InvalidFeatureValueError(input.featureKey);
  }

  await tenantDb.execute(input.tenantId, async (tx) => {
    // Check entitlement before allowing feature configuration
    const entitlements = await repo.getEntitlements(tx, input.tenantId);
    const requiredModule = FEATURE_MODULE_REQUIREMENTS[input.featureKey];

    if (!isEntitled(entitlements, requiredModule)) {
      throw new EntitlementRequiredError(requiredModule);
    }

    const current = await repo.getFeatureValue(tx, input.tenantId, input.featureKey);
    const previousValue = current?.value;

    await repo.saveFeature(tx, {
      tenantId: input.tenantId,
      featureKey: input.featureKey,
      value: input.value,
      version: (current?.version ?? 0) + 1,
      updatedAt: new Date(),
      updatedBy: input.actorId,
    });

    await outboxWriter.write(tx, {
      eventType: 'carecareer.feature-configuration.updated.v1',
      aggregateType: 'feature-configuration',
      aggregateId: `${input.tenantId}:${input.featureKey}`,
      aggregateVersion: (current?.version ?? 0) + 1,
      data: {
        tenantId: input.tenantId,
        featureKey: input.featureKey,
        previousValue: previousValue ?? null,
        newValue: input.value,
      },
    });
  });
}
