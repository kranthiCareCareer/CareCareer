import { useState } from 'react';

/**
 * Recruiter Mission Control
 *
 * Combines priority queue, AI-ranked candidates, jobs at risk,
 * and communication history in one workspace.
 * The recruiter can act without leaving the screen.
 */

interface Candidate {
  id: string;
  name: string;
  profession: string;
  score: number;
  status: 'hot-lead' | 'engaged' | 'cooling' | 'unresponsive';
  lastContact: string;
  matchedJobs: number;
}

interface Job {
  id: string;
  facility: string;
  role: string;
  urgency: 'critical' | 'high' | 'normal';
  submissions: number;
  slaDeadline: string;
  fillProbability: number;
}

interface DailyBriefing {
  highIntentCandidates: number;
  jobsAtSlaRisk: number;
  contactBefore: string;
  placements: number;
  targetPlacements: number;
}

const DEMO_BRIEFING: DailyBriefing = {
  highIntentCandidates: 14,
  jobsAtSlaRisk: 6,
  contactBefore: 'noon',
  placements: 8,
  targetPlacements: 12,
};

const DEMO_CANDIDATES: Candidate[] = [
  { id: 'c1', name: 'Maria Rodriguez, RN', profession: 'Registered Nurse', score: 96, status: 'hot-lead', lastContact: '2h ago', matchedJobs: 4 },
  { id: 'c2', name: 'James Wilson, CNA', profession: 'CNA', score: 91, status: 'hot-lead', lastContact: '4h ago', matchedJobs: 7 },
  { id: 'c3', name: 'Ashley Chen, LPN', profession: 'LPN', score: 88, status: 'engaged', lastContact: '1d ago', matchedJobs: 3 },
  { id: 'c4', name: 'David Thompson, RT', profession: 'Respiratory Therapist', score: 85, status: 'engaged', lastContact: '2d ago', matchedJobs: 2 },
  { id: 'c5', name: 'Sarah Johnson, RN', profession: 'Registered Nurse', score: 82, status: 'cooling', lastContact: '5d ago', matchedJobs: 5 },
  { id: 'c6', name: 'Michael Brown, CNA', profession: 'CNA', score: 78, status: 'cooling', lastContact: '7d ago', matchedJobs: 3 },
];

const DEMO_JOBS: Job[] = [
  { id: 'j1', facility: 'Mercy General', role: 'RN - ICU', urgency: 'critical', submissions: 1, slaDeadline: 'Tomorrow', fillProbability: 42 },
  { id: 'j2', facility: 'Baptist Memorial', role: 'CNA - Med/Surg', urgency: 'critical', submissions: 0, slaDeadline: 'Today', fillProbability: 28 },
  { id: 'j3', facility: 'St. Luke\'s', role: 'LPN - Rehab', urgency: 'high', submissions: 2, slaDeadline: '3 days', fillProbability: 67 },
  { id: 'j4', facility: 'Regional Medical', role: 'RT - ER', urgency: 'high', submissions: 1, slaDeadline: '2 days', fillProbability: 55 },
  { id: 'j5', facility: 'Community Health', role: 'RN - Tele', urgency: 'normal', submissions: 3, slaDeadline: '5 days', fillProbability: 81 },
];

export function RecruiterDashboard() {
  const [briefing] = useState(DEMO_BRIEFING);
  const [candidates] = useState(DEMO_CANDIDATES);
  const [jobs] = useState(DEMO_JOBS);

  return (
    <div className="recruiter-mc">
      {/* Daily Briefing */}
      <section className="rmc-briefing" aria-labelledby="rmc-briefing-heading">
        <div className="rmc-briefing__icon">✦</div>
        <div className="rmc-briefing__content">
          <h2 id="rmc-briefing-heading" className="rmc-briefing__title">Your Daily Briefing</h2>
          <p className="rmc-briefing__text">
            You have <strong>{briefing.highIntentCandidates} high-intent candidates</strong>,{' '}
            <strong>{briefing.jobsAtSlaRisk} jobs at risk</strong> of missing SLA, and{' '}
            <strong>9 candidates</strong> who should be contacted before {briefing.contactBefore}.
            Placements this week: {briefing.placements}/{briefing.targetPlacements}.
          </p>
        </div>
      </section>

      <div className="rmc-workspace">
        {/* Priority Candidate Queue */}
        <section className="rmc-panel rmc-panel--candidates" aria-labelledby="candidates-heading">
          <h2 id="candidates-heading" className="rmc-panel__title">
            Priority Candidates
            <span className="rmc-panel__badge">{candidates.length}</span>
          </h2>
          <div className="rmc-candidates">
            {candidates.map((c) => (
              <article key={c.id} className="rmc-candidate" aria-label={c.name}>
                <div className="rmc-candidate__header">
                  <div className="rmc-candidate__avatar">{c.name.charAt(0)}</div>
                  <div className="rmc-candidate__info">
                    <span className="rmc-candidate__name">{c.name}</span>
                    <span className="rmc-candidate__profession">{c.profession}</span>
                  </div>
                  <div className="rmc-candidate__score" data-score={c.score >= 90 ? 'excellent' : c.score >= 80 ? 'good' : 'fair'}>
                    {c.score}
                  </div>
                </div>
                <div className="rmc-candidate__meta">
                  <span className={`rmc-candidate__status rmc-candidate__status--${c.status}`}>{c.status.replace('-', ' ')}</span>
                  <span className="rmc-candidate__contact">Last: {c.lastContact}</span>
                  <span className="rmc-candidate__matches">{c.matchedJobs} matches</span>
                </div>
                <div className="rmc-candidate__actions">
                  <button className="rmc-btn rmc-btn--primary">Message</button>
                  <button className="rmc-btn">Submit</button>
                  <button className="rmc-btn">Profile</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Jobs at Risk */}
        <section className="rmc-panel rmc-panel--jobs" aria-labelledby="jobs-heading">
          <h2 id="jobs-heading" className="rmc-panel__title">
            Jobs Needing Action
            <span className="rmc-panel__badge rmc-panel__badge--danger">{jobs.filter(j => j.urgency === 'critical').length} critical</span>
          </h2>
          <div className="rmc-jobs">
            {jobs.map((j) => (
              <article key={j.id} className={`rmc-job rmc-job--${j.urgency}`} aria-label={`${j.role} at ${j.facility}`}>
                <div className="rmc-job__header">
                  <span className="rmc-job__role">{j.role}</span>
                  <span className={`rmc-job__urgency rmc-job__urgency--${j.urgency}`}>{j.urgency}</span>
                </div>
                <span className="rmc-job__facility">{j.facility}</span>
                <div className="rmc-job__stats">
                  <span>Submissions: {j.submissions}</span>
                  <span>SLA: {j.slaDeadline}</span>
                  <span>Fill prob: {j.fillProbability}%</span>
                </div>
                <div className="rmc-job__actions">
                  <button className="rmc-btn rmc-btn--primary">Find Matches</button>
                  <button className="rmc-btn">Details</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
