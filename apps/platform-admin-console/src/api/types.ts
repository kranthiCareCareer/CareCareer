/** Tenant lifecycle states */
export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Organization {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  createdAt: string;
  createdBy: string;
}

export type ModuleKey =
  | 'core'
  | 'workforce'
  | 'credentialing'
  | 'scheduling'
  | 'timekeeping'
  | 'pay_bill_preview'
  | 'recruiting'
  | 'engagement'
  | 'vms'
  | 'analytics';

export interface EntitlementSet {
  tenantId: string;
  modules: Record<ModuleKey, boolean>;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export type FeatureKey =
  | 'scheduling.auto_confirm_enabled'
  | 'scheduling.max_workers_per_shift'
  | 'timekeeping.geofence_required'
  | 'timekeeping.allowed_clock_in_minutes_before'
  | 'timekeeping.allowed_clock_in_minutes_after'
  | 'timekeeping.break_reminder_enabled'
  | 'recruiting.auto_post_to_boards'
  | 'notifications.sms_enabled'
  | 'notifications.push_enabled';

export interface FeatureConfiguration {
  tenantId: string;
  featureKey: FeatureKey;
  value: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AuditRecord {
  id: string;
  tenantId: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  reason?: string;
  correlationId: string;
  outcome: string;
  createdAt: string;
}

export interface DashboardStats {
  totalTenants: number;
  byStatus: Record<TenantStatus, number>;
  organizationCount: number;
  branchCount: number;
  enabledModuleCounts: Record<string, number>;
  recentActivity: AuditRecord[];
}

export interface ErrorEnvelope {
  statusCode: number;
  message: string;
  code?: string;
  error?: string;
}

/** Demo persona for pre-production authentication */
export interface DemoPersona {
  id: string;
  label: string;
  role: string;
  tenantId?: string;
  description: string;
}
