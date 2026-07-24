import { useState } from 'react';
import { CANDIDATES, type DemoCandidate, formatRate } from '../data/demo-data';

/**
 * Candidate 360 Profile
 *
 * Complete candidate record with progressive disclosure.
 * Uses tabs, contextual panels, and activity timeline.
 */

type TabId = 'overview' | 'credentials' | 'work-history' | 'applications' | 'communications' | 'documents';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'work-history', label: 'Work History' },
  { id: 'applications', label: 'Applications' },
  { id: 'communications', label: 'Communications' },
  { id: 'documents', label: 'Documents' },
];

export function CandidateProfile() {
  const [candidate] = useState<DemoCandidate>(CANDIDATES[0]!);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const readyCredentials = candidate.credentials.filter((c) => c.status === 'verified').length;
  const totalCredentials = candidate.credentials.length;
  const readinessPercent = Math.round((readyCredentials / totalCredentials) * 100);

  return (
    <div className="candidate-360">
      {/* Profile Header — sticky summary */}
      <header className="c360-header">
        <div className="c360-header__avatar">
          {candidate.firstName.charAt(0)}{candidate.lastName.charAt(0)}
        </div>
        <div className="c360-header__info">
          <h1 className="c360-header__name">
            {candidate.firstName} {candidate.lastName}, {candidate.profession}
          </h1>
          <p className="c360-header__subtitle">
            {candidate.specialty} | {candidate.location} | Available: {candidate.availableFrom}
          </p>
        </div>
        <div className="c360-header__metrics">
          <div className="c360-metric">
            <span className="c360-metric__value">{candidate.engagementScore}</span>
            <span className="c360-metric__label">Engagement</span>
          </div>
          <div className="c360-metric">
            <span className="c360-metric__value">{readinessPercent}%</span>
            <span className="c360-metric__label">Credential Ready</span>
          </div>
          <div className="c360-metric">
            <span className="c360-metric__value">{formatRate(candidate.payExpectation)}</span>
            <span className="c360-metric__label">Pay Expectation</span>
          </div>
        </div>
        <div className="c360-header__actions">
          <button className="c360-btn c360-btn--primary">Message</button>
          <button className="c360-btn c360-btn--secondary">Submit to Job</button>
          <button className="c360-btn c360-btn--secondary">Schedule</button>
        </div>
      </header>

      {/* Status bar */}
      <div className="c360-status-bar">
        <span className={`c360-status c360-status--${candidate.status}`}>{candidate.status}</span>
        <span className={`c360-engagement c360-engagement--${candidate.engagementStatus}`}>
          {candidate.engagementStatus.replace('-', ' ')}
        </span>
        <span className="c360-last-contact">Last contact: {candidate.lastContact}</span>
      </div>

      {/* Tabs */}
      <nav className="c360-tabs" role="tablist" aria-label="Candidate sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`c360-tab ${activeTab === tab.id ? 'c360-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="c360-content" role="tabpanel">
        {activeTab === 'overview' && <OverviewTab candidate={candidate} />}
        {activeTab === 'credentials' && <CredentialsTab candidate={candidate} />}
        {activeTab === 'work-history' && <WorkHistoryTab />}
        {activeTab === 'applications' && <ApplicationsTab />}
        {activeTab === 'communications' && <CommunicationsTab />}
        {activeTab === 'documents' && <DocumentsTab />}
      </div>
    </div>
  );
}

function OverviewTab({ candidate }: { candidate: DemoCandidate }) {
  return (
    <div className="c360-overview">
      <div className="c360-overview__grid">
        {/* Professional Summary */}
        <section className="c360-card">
          <h3 className="c360-card__title">Professional Summary</h3>
          <dl className="c360-dl">
            <dt>Profession</dt><dd>{candidate.profession}</dd>
            <dt>Specialty</dt><dd>{candidate.specialty}</dd>
            <dt>Experience</dt><dd>8 years</dd>
            <dt>Location</dt><dd>{candidate.location}</dd>
            <dt>Availability</dt><dd>{candidate.availableFrom}</dd>
            <dt>Pay Expectation</dt><dd>{formatRate(candidate.payExpectation)}</dd>
            <dt>Preferred Shift</dt><dd>Day, Night</dd>
            <dt>Travel Willing</dt><dd>Up to 50 miles</dd>
          </dl>
        </section>

        {/* Credential Readiness */}
        <section className="c360-card">
          <h3 className="c360-card__title">Credential Readiness</h3>
          <div className="c360-readiness">
            <div className="c360-readiness__bar">
              <div className="c360-readiness__fill" style={{ width: `${readinessPercent(candidate)}%` }} />
            </div>
            <span className="c360-readiness__text">{candidate.credentials.filter(c => c.status === 'verified').length}/{candidate.credentials.length} verified</span>
          </div>
          <ul className="c360-cred-list">
            {candidate.credentials.map((cred, i) => (
              <li key={i} className={`c360-cred c360-cred--${cred.status}`}>
                <span className="c360-cred__type">{cred.type}</span>
                <span className="c360-cred__status">{cred.status}</span>
                {cred.expiresAt && <span className="c360-cred__expires">Exp: {cred.expiresAt}</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* AI Recommendations */}
        <section className="c360-card c360-card--ai">
          <h3 className="c360-card__title"><span className="c360-ai-icon">✦</span> AI Recommendations</h3>
          <ul className="c360-ai-list">
            <li className="c360-ai-item">
              <strong>Best Match:</strong> Mercy General ICU (96% match)
              <span className="c360-ai-reason">Skills, credentials, and location align perfectly.</span>
            </li>
            <li className="c360-ai-item">
              <strong>Engagement Risk:</strong> Low
              <span className="c360-ai-reason">High response rate, recent activity, strong NPS.</span>
            </li>
            <li className="c360-ai-item">
              <strong>Action:</strong> Submit to J-001 immediately
              <span className="c360-ai-reason">SLA deadline tomorrow. This candidate fills all requirements.</span>
            </li>
          </ul>
        </section>

        {/* Recent Activity */}
        <section className="c360-card">
          <h3 className="c360-card__title">Recent Activity</h3>
          <ul className="c360-timeline">
            <li className="c360-timeline__item">
              <span className="c360-timeline__time">2h ago</span>
              <span className="c360-timeline__event">Replied to recruiter message</span>
            </li>
            <li className="c360-timeline__item">
              <span className="c360-timeline__time">1d ago</span>
              <span className="c360-timeline__event">Viewed Mercy General ICU shift</span>
            </li>
            <li className="c360-timeline__item">
              <span className="c360-timeline__time">3d ago</span>
              <span className="c360-timeline__event">Updated availability to Immediate</span>
            </li>
            <li className="c360-timeline__item">
              <span className="c360-timeline__time">5d ago</span>
              <span className="c360-timeline__event">Completed timecard for previous assignment</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function readinessPercent(candidate: DemoCandidate): number {
  const verified = candidate.credentials.filter((c) => c.status === 'verified').length;
  return Math.round((verified / candidate.credentials.length) * 100);
}

function CredentialsTab({ candidate }: { candidate: DemoCandidate }) {
  return (
    <div className="c360-credentials-tab">
      <div className="c360-cred-grid">
        {candidate.credentials.map((cred, i) => (
          <article key={i} className={`c360-cred-card c360-cred-card--${cred.status}`}>
            <div className="c360-cred-card__header">
              <span className="c360-cred-card__type">{cred.type}</span>
              <span className={`c360-cred-card__badge c360-cred-card__badge--${cred.status}`}>{cred.status}</span>
            </div>
            {cred.issuingAuthority && <span className="c360-cred-card__issuer">{cred.issuingAuthority}</span>}
            {cred.expiresAt && <span className="c360-cred-card__expires">Expires: {cred.expiresAt}</span>}
            <div className="c360-cred-card__actions">
              {cred.status === 'missing' && <button className="c360-btn c360-btn--small">Request</button>}
              {cred.status === 'expiring' && <button className="c360-btn c360-btn--small">Renew</button>}
              {cred.status === 'pending' && <button className="c360-btn c360-btn--small">Verify</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function WorkHistoryTab() {
  return (
    <div className="c360-tab-content">
      <div className="c360-work-history">
        {[
          { facility: 'Mercy General Hospital', role: 'RN - ICU', period: 'Jan 2025 - Present', shifts: 48, rating: 4.8 },
          { facility: 'Baptist Memorial', role: 'RN - Med/Surg', period: 'Jun 2024 - Dec 2024', shifts: 92, rating: 4.6 },
          { facility: 'St. Luke\'s Health', role: 'RN - Tele', period: 'Jan 2024 - May 2024', shifts: 67, rating: 4.9 },
        ].map((entry, i) => (
          <article key={i} className="c360-work-entry">
            <div className="c360-work-entry__header">
              <span className="c360-work-entry__facility">{entry.facility}</span>
              <span className="c360-work-entry__rating">★ {entry.rating}</span>
            </div>
            <span className="c360-work-entry__role">{entry.role}</span>
            <span className="c360-work-entry__period">{entry.period} · {entry.shifts} shifts</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function ApplicationsTab() {
  return (
    <div className="c360-tab-content">
      <table className="c360-table">
        <thead>
          <tr><th>Job</th><th>Facility</th><th>Status</th><th>Submitted</th></tr>
        </thead>
        <tbody>
          <tr><td>RN - ICU</td><td>Mercy General</td><td><span className="c360-badge c360-badge--pending">Pending Review</span></td><td>Today</td></tr>
          <tr><td>RN - Tele</td><td>Community Health</td><td><span className="c360-badge c360-badge--confirmed">Confirmed</span></td><td>3 days ago</td></tr>
          <tr><td>RN - ER</td><td>Regional Medical</td><td><span className="c360-badge c360-badge--rejected">Not Selected</span></td><td>1 week ago</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function CommunicationsTab() {
  return (
    <div className="c360-tab-content">
      <ul className="c360-comms-timeline">
        <li className="c360-comm c360-comm--inbound">
          <span className="c360-comm__time">2h ago</span>
          <span className="c360-comm__channel">SMS</span>
          <p className="c360-comm__message">Yes, I'm interested in the ICU position at Mercy. What are the hours?</p>
        </li>
        <li className="c360-comm c360-comm--outbound">
          <span className="c360-comm__time">6h ago</span>
          <span className="c360-comm__channel">SMS</span>
          <p className="c360-comm__message">Hi Maria! We have an urgent ICU opening at Mercy General. 7a-7p, $55/hr. Interested?</p>
        </li>
        <li className="c360-comm c360-comm--outbound">
          <span className="c360-comm__time">3d ago</span>
          <span className="c360-comm__channel">Email</span>
          <p className="c360-comm__message">New opportunities matching your preferences are available in Atlanta...</p>
        </li>
      </ul>
    </div>
  );
}

function DocumentsTab() {
  return (
    <div className="c360-tab-content">
      <div className="c360-doc-list">
        {[
          { name: 'RN License (GA)', type: 'License', uploaded: '2026-01-15', size: '245 KB' },
          { name: 'BLS Certification', type: 'Certification', uploaded: '2025-11-01', size: '189 KB' },
          { name: 'ACLS Card', type: 'Certification', uploaded: '2025-12-20', size: '156 KB' },
          { name: 'Background Check Report', type: 'Compliance', uploaded: '2026-02-01', size: '1.2 MB' },
          { name: 'Resume', type: 'Profile', uploaded: '2026-03-01', size: '342 KB' },
        ].map((doc, i) => (
          <div key={i} className="c360-doc">
            <span className="c360-doc__name">{doc.name}</span>
            <span className="c360-doc__type">{doc.type}</span>
            <span className="c360-doc__date">{doc.uploaded}</span>
            <span className="c360-doc__size">{doc.size}</span>
            <button className="c360-btn c360-btn--small">View</button>
          </div>
        ))}
      </div>
    </div>
  );
}
