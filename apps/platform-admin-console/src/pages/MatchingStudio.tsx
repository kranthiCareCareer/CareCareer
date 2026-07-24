import { useState } from 'react';
import { JOBS, CANDIDATES, type DemoCandidate, type DemoJob, formatRate } from '../data/demo-data';

/**
 * AI Matching Studio
 *
 * Signature screen: explainable AI matching with side-by-side comparison.
 * Shows why a candidate matches, confidence, risks, and actions.
 */

interface MatchResult {
  candidate: DemoCandidate;
  overallScore: number;
  factors: Array<{ name: string; score: number; status: 'strong' | 'moderate' | 'weak' | 'missing' }>;
  risks: string[];
  recommendation: string;
}

function generateMatches(job: DemoJob): MatchResult[] {
  return CANDIDATES
    .filter((c) => c.profession === job.role)
    .map((c) => {
      const credMatch = c.credentials.filter((cr) => cr.status === 'verified').length / Math.max(c.credentials.length, 1);
      const locationMatch = c.location.includes(job.location.split(',')[0]!) ? 1 : 0.6;
      const payMatch = c.payExpectation <= job.payRate ? 1 : 0.7;
      const overallScore = Math.round((c.engagementScore * 0.3 + credMatch * 100 * 0.3 + locationMatch * 100 * 0.2 + payMatch * 100 * 0.2));

      const factors = [
        { name: 'Skills & Specialty', score: c.specialty === job.specialty ? 95 : 72, status: (c.specialty === job.specialty ? 'strong' : 'moderate') as 'strong' | 'moderate' },
        { name: 'Credentials', score: Math.round(credMatch * 100), status: (credMatch >= 0.9 ? 'strong' : credMatch >= 0.6 ? 'moderate' : 'weak') as 'strong' | 'moderate' | 'weak' },
        { name: 'Location', score: Math.round(locationMatch * 100), status: (locationMatch >= 0.9 ? 'strong' : 'moderate') as 'strong' | 'moderate' },
        { name: 'Pay Alignment', score: Math.round(payMatch * 100), status: (payMatch >= 0.9 ? 'strong' : 'moderate') as 'strong' | 'moderate' },
        { name: 'Engagement', score: c.engagementScore, status: (c.engagementScore >= 85 ? 'strong' : 'moderate') as 'strong' | 'moderate' },
        { name: 'Availability', score: c.availableFrom === 'Immediate' ? 100 : 70, status: (c.availableFrom === 'Immediate' ? 'strong' : 'moderate') as 'strong' | 'moderate' },
      ];

      const risks: string[] = [];
      if (c.credentials.some((cr) => cr.status === 'expiring')) risks.push('Credential expiring soon');
      if (c.engagementStatus === 'cooling') risks.push('Engagement declining');
      if (c.credentials.some((cr) => cr.status === 'missing')) risks.push('Missing required credential');

      return { candidate: c, overallScore, factors, risks, recommendation: overallScore > 85 ? 'Strong match — submit immediately' : 'Good match — review before submission' };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}

export function MatchingStudio() {
  const [selectedJob] = useState<DemoJob>(JOBS[0]!);
  const [matches] = useState<MatchResult[]>(() => generateMatches(JOBS[0]!));
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(matches[0] ?? null);

  return (
    <div className="matching-studio">
      <header className="ms-header">
        <div className="ms-header__left">
          <h1 className="ms-header__title">AI Matching Studio</h1>
          <p className="ms-header__subtitle">Explainable candidate-job matching</p>
        </div>
        <div className="ms-header__job">
          <span className="ms-header__job-label">Matching for:</span>
          <span className="ms-header__job-title">{selectedJob.role} - {selectedJob.specialty}</span>
          <span className="ms-header__job-facility">{selectedJob.facilityName}</span>
        </div>
      </header>

      <div className="ms-workspace">
        {/* Left: Match list */}
        <aside className="ms-list" aria-label="Ranked candidates">
          <h2 className="ms-list__title">AI-Ranked Candidates ({matches.length})</h2>
          {matches.map((match) => (
            <button
              key={match.candidate.id}
              className={`ms-match-card ${selectedMatch?.candidate.id === match.candidate.id ? 'ms-match-card--selected' : ''}`}
              onClick={() => setSelectedMatch(match)}
              aria-label={`${match.candidate.firstName} ${match.candidate.lastName}, score ${match.overallScore}`}
            >
              <div className="ms-match-card__header">
                <span className="ms-match-card__name">{match.candidate.firstName} {match.candidate.lastName}</span>
                <span className={`ms-match-card__score ${match.overallScore >= 85 ? 'ms-match-card__score--high' : ''}`}>{match.overallScore}</span>
              </div>
              <span className="ms-match-card__profession">{match.candidate.profession} - {match.candidate.specialty}</span>
              {match.risks.length > 0 && <span className="ms-match-card__risk">{match.risks.length} risk(s)</span>}
            </button>
          ))}
        </aside>

        {/* Right: Detail comparison */}
        {selectedMatch && (
          <main className="ms-detail">
            {/* Score header */}
            <div className="ms-detail__header">
              <div className="ms-detail__score-circle" data-score={selectedMatch.overallScore >= 85 ? 'high' : 'medium'}>
                {selectedMatch.overallScore}
              </div>
              <div className="ms-detail__candidate-info">
                <h2>{selectedMatch.candidate.firstName} {selectedMatch.candidate.lastName}, {selectedMatch.candidate.profession}</h2>
                <p>{selectedMatch.candidate.specialty} | {selectedMatch.candidate.location}</p>
              </div>
              <div className="ms-detail__actions">
                <button className="ms-btn ms-btn--primary">Submit</button>
                <button className="ms-btn ms-btn--secondary">Shortlist</button>
                <button className="ms-btn ms-btn--ghost">Reject</button>
              </div>
            </div>

            {/* AI Explanation */}
            <section className="ms-explanation" aria-labelledby="ai-explanation">
              <h3 id="ai-explanation" className="ms-explanation__title"><span className="ms-ai-icon">✦</span> Why This Match</h3>
              <p className="ms-explanation__text">{selectedMatch.recommendation}</p>
            </section>

            {/* Factor Breakdown */}
            <section className="ms-factors" aria-labelledby="factors-heading">
              <h3 id="factors-heading" className="ms-factors__title">Match Factors</h3>
              <div className="ms-factors__grid">
                {selectedMatch.factors.map((f) => (
                  <div key={f.name} className={`ms-factor ms-factor--${f.status}`}>
                    <span className="ms-factor__name">{f.name}</span>
                    <div className="ms-factor__bar">
                      <div className="ms-factor__fill" style={{ width: `${f.score}%` }} />
                    </div>
                    <span className="ms-factor__score">{f.score}%</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Risks */}
            {selectedMatch.risks.length > 0 && (
              <section className="ms-risks" aria-labelledby="risks-heading">
                <h3 id="risks-heading" className="ms-risks__title">Concerns</h3>
                <ul className="ms-risks__list">
                  {selectedMatch.risks.map((risk, i) => (
                    <li key={i} className="ms-risk-item">{risk}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Side-by-side comparison */}
            <section className="ms-comparison" aria-labelledby="comparison-heading">
              <h3 id="comparison-heading" className="ms-comparison__title">Requirement Alignment</h3>
              <div className="ms-comparison__grid">
                <div className="ms-comparison__col">
                  <h4>Job Requires</h4>
                  <ul>
                    {selectedJob.credentialRequirements.map((r) => <li key={r}>{r}</li>)}
                    <li>Pay: {formatRate(selectedJob.payRate)}</li>
                    <li>Location: {selectedJob.location}</li>
                    <li>Start: {selectedJob.startDate}</li>
                  </ul>
                </div>
                <div className="ms-comparison__col">
                  <h4>Candidate Has</h4>
                  <ul>
                    {selectedMatch.candidate.credentials.map((c, i) => (
                      <li key={i} className={`ms-cred-status--${c.status}`}>{c.type} ({c.status})</li>
                    ))}
                    <li>Pay: {formatRate(selectedMatch.candidate.payExpectation)}</li>
                    <li>Location: {selectedMatch.candidate.location}</li>
                    <li>Available: {selectedMatch.candidate.availableFrom}</li>
                  </ul>
                </div>
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
