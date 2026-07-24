/**
 * CareCareer Centralized Demo Data
 *
 * Shared typed entities and IDs used across all screens.
 * Candidates, jobs, facilities, and workflows reference the same data
 * to maintain consistency in the demo experience.
 */

// ─── Entities ────────────────────────────────────────────────────────────────

export interface DemoCandidate {
  id: string;
  firstName: string;
  lastName: string;
  profession: 'RN' | 'LPN' | 'CNA' | 'RT' | 'ALLIED';
  specialty: string;
  status: 'active' | 'screening' | 'credentialing' | 'ready' | 'blocked';
  engagementScore: number;
  engagementStatus: 'hot-lead' | 'engaged' | 'cooling' | 'unresponsive';
  lastContact: string;
  location: string;
  payExpectation: number;
  availableFrom: string;
  credentials: DemoCredential[];
  matchScore?: number;
}

export interface DemoCredential {
  type: string;
  status: 'verified' | 'pending' | 'expiring' | 'expired' | 'missing';
  expiresAt?: string;
  issuingAuthority?: string;
}

export interface DemoJob {
  id: string;
  facilityId: string;
  facilityName: string;
  role: string;
  specialty: string;
  type: 'per-diem' | 'travel' | 'local-contract' | 'permanent' | 'float-pool';
  urgency: 'critical' | 'high' | 'normal' | 'low';
  openPositions: number;
  submissions: number;
  payRate: number;
  billRate: number;
  margin: number;
  slaDeadline: string;
  fillProbability: number;
  startDate: string;
  duration: string;
  credentialRequirements: string[];
  location: string;
}

export interface DemoFacility {
  id: string;
  name: string;
  city: string;
  state: string;
  type: string;
  fillRate: number;
  activeWorkers: number;
  openShifts: number;
  status: 'healthy' | 'at-risk' | 'critical';
}

export interface DemoShift {
  id: string;
  facilityId: string;
  facilityName: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'open' | 'filled' | 'in-progress' | 'completed' | 'cancelled';
  payRate: number;
  assignedWorker?: string;
}

// ─── Demo Data ───────────────────────────────────────────────────────────────

export const FACILITIES: DemoFacility[] = [
  { id: 'f1', name: 'Mercy General Hospital', city: 'Atlanta', state: 'GA', type: 'Acute Care', fillRate: 94.1, activeWorkers: 127, openShifts: 12, status: 'healthy' },
  { id: 'f2', name: 'Baptist Memorial Medical', city: 'Memphis', state: 'TN', type: 'Acute Care', fillRate: 72.3, activeWorkers: 89, openShifts: 34, status: 'critical' },
  { id: 'f3', name: 'St. Luke\'s Health', city: 'Houston', state: 'TX', type: 'Rehabilitation', fillRate: 88.5, activeWorkers: 45, openShifts: 8, status: 'healthy' },
  { id: 'f4', name: 'Regional Medical Center', city: 'Charlotte', state: 'NC', type: 'Acute Care', fillRate: 81.2, activeWorkers: 63, openShifts: 15, status: 'at-risk' },
  { id: 'f5', name: 'Community Health Partners', city: 'Denver', state: 'CO', type: 'Long-term Care', fillRate: 91.7, activeWorkers: 34, openShifts: 5, status: 'healthy' },
];

export const CANDIDATES: DemoCandidate[] = [
  {
    id: 'c1', firstName: 'Maria', lastName: 'Rodriguez', profession: 'RN', specialty: 'ICU',
    status: 'ready', engagementScore: 96, engagementStatus: 'hot-lead', lastContact: '2h ago',
    location: 'Atlanta, GA', payExpectation: 52, availableFrom: 'Immediate',
    credentials: [
      { type: 'RN License (GA)', status: 'verified', expiresAt: '2027-03-15', issuingAuthority: 'GA Board of Nursing' },
      { type: 'BLS', status: 'verified', expiresAt: '2026-11-01' },
      { type: 'ACLS', status: 'verified', expiresAt: '2027-01-20' },
    ],
  },
  {
    id: 'c2', firstName: 'James', lastName: 'Wilson', profession: 'CNA', specialty: 'Med/Surg',
    status: 'ready', engagementScore: 91, engagementStatus: 'hot-lead', lastContact: '4h ago',
    location: 'Memphis, TN', payExpectation: 22, availableFrom: 'Next week',
    credentials: [
      { type: 'CNA Certification (TN)', status: 'verified', expiresAt: '2027-06-01' },
      { type: 'BLS', status: 'verified', expiresAt: '2026-12-15' },
      { type: 'Background Check', status: 'verified' },
    ],
  },
  {
    id: 'c3', firstName: 'Ashley', lastName: 'Chen', profession: 'LPN', specialty: 'Geriatrics',
    status: 'credentialing', engagementScore: 88, engagementStatus: 'engaged', lastContact: '1d ago',
    location: 'Houston, TX', payExpectation: 32, availableFrom: '2 weeks',
    credentials: [
      { type: 'LPN License (TX)', status: 'verified', expiresAt: '2027-08-01' },
      { type: 'BLS', status: 'expiring', expiresAt: '2026-08-15' },
      { type: 'TB Test', status: 'missing' },
    ],
  },
  {
    id: 'c4', firstName: 'David', lastName: 'Thompson', profession: 'RT', specialty: 'Pulmonary',
    status: 'ready', engagementScore: 85, engagementStatus: 'engaged', lastContact: '2d ago',
    location: 'Charlotte, NC', payExpectation: 45, availableFrom: 'Immediate',
    credentials: [
      { type: 'RT License (NC)', status: 'verified', expiresAt: '2027-04-01' },
      { type: 'BLS', status: 'verified', expiresAt: '2027-02-01' },
      { type: 'NBRC', status: 'verified', expiresAt: '2027-05-01' },
    ],
  },
  {
    id: 'c5', firstName: 'Sarah', lastName: 'Johnson', profession: 'RN', specialty: 'Emergency',
    status: 'ready', engagementScore: 82, engagementStatus: 'cooling', lastContact: '5d ago',
    location: 'Atlanta, GA', payExpectation: 48, availableFrom: '1 week',
    credentials: [
      { type: 'RN License (GA)', status: 'verified', expiresAt: '2027-01-01' },
      { type: 'BLS', status: 'verified', expiresAt: '2026-09-01' },
      { type: 'ACLS', status: 'expiring', expiresAt: '2026-08-01' },
      { type: 'PALS', status: 'verified', expiresAt: '2027-03-01' },
    ],
  },
  {
    id: 'c6', firstName: 'Michael', lastName: 'Brown', profession: 'CNA', specialty: 'Oncology',
    status: 'screening', engagementScore: 78, engagementStatus: 'cooling', lastContact: '7d ago',
    location: 'Denver, CO', payExpectation: 24, availableFrom: '3 weeks',
    credentials: [
      { type: 'CNA Certification (CO)', status: 'pending' },
      { type: 'BLS', status: 'missing' },
    ],
  },
];

export const JOBS: DemoJob[] = [
  {
    id: 'j1', facilityId: 'f1', facilityName: 'Mercy General Hospital',
    role: 'RN', specialty: 'ICU', type: 'per-diem', urgency: 'critical',
    openPositions: 3, submissions: 1, payRate: 55, billRate: 88, margin: 37.5,
    slaDeadline: 'Tomorrow', fillProbability: 42, startDate: '2026-07-26',
    duration: 'Per Diem', credentialRequirements: ['RN License', 'BLS', 'ACLS'],
    location: 'Atlanta, GA',
  },
  {
    id: 'j2', facilityId: 'f2', facilityName: 'Baptist Memorial Medical',
    role: 'CNA', specialty: 'Med/Surg', type: 'per-diem', urgency: 'critical',
    openPositions: 5, submissions: 0, payRate: 24, billRate: 42, margin: 42.8,
    slaDeadline: 'Today', fillProbability: 28, startDate: '2026-07-25',
    duration: 'Per Diem', credentialRequirements: ['CNA Cert', 'BLS', 'Background'],
    location: 'Memphis, TN',
  },
  {
    id: 'j3', facilityId: 'f3', facilityName: 'St. Luke\'s Health',
    role: 'LPN', specialty: 'Rehab', type: 'local-contract', urgency: 'high',
    openPositions: 2, submissions: 2, payRate: 35, billRate: 58, margin: 39.6,
    slaDeadline: '3 days', fillProbability: 67, startDate: '2026-07-28',
    duration: '13 weeks', credentialRequirements: ['LPN License', 'BLS', 'TB Test'],
    location: 'Houston, TX',
  },
  {
    id: 'j4', facilityId: 'f4', facilityName: 'Regional Medical Center',
    role: 'RT', specialty: 'Emergency', type: 'travel', urgency: 'high',
    openPositions: 1, submissions: 1, payRate: 48, billRate: 78, margin: 38.4,
    slaDeadline: '2 days', fillProbability: 55, startDate: '2026-08-01',
    duration: '8 weeks', credentialRequirements: ['RT License', 'BLS', 'NBRC'],
    location: 'Charlotte, NC',
  },
  {
    id: 'j5', facilityId: 'f5', facilityName: 'Community Health Partners',
    role: 'RN', specialty: 'Telemetry', type: 'permanent', urgency: 'normal',
    openPositions: 1, submissions: 3, payRate: 42, billRate: 0, margin: 0,
    slaDeadline: '5 days', fillProbability: 81, startDate: '2026-08-15',
    duration: 'Permanent', credentialRequirements: ['RN License', 'BLS'],
    location: 'Denver, CO',
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getCandidateById(id: string): DemoCandidate | undefined {
  return CANDIDATES.find((c) => c.id === id);
}

export function getJobById(id: string): DemoJob | undefined {
  return JOBS.find((j) => j.id === id);
}

export function getFacilityById(id: string): DemoFacility | undefined {
  return FACILITIES.find((f) => f.id === id);
}

export function getMatchesForJob(jobId: string): Array<DemoCandidate & { matchScore: number }> {
  const job = getJobById(jobId);
  if (!job) return [];

  return CANDIDATES
    .filter((c) => c.profession === job.role || c.specialty === job.specialty)
    .map((c) => ({
      ...c,
      matchScore: Math.min(99, c.engagementScore + Math.floor(Math.random() * 5)),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatRate(rate: number): string {
  return `$${rate}/hr`;
}
