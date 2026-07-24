import { useState } from 'react';
import { JOBS, formatRate, type DemoJob } from '../data/demo-data';

/**
 * Jobs and Orders Workspace
 *
 * Supports per diem, travel, local contract, permanent, and float pool.
 * Dual view: data grid + pipeline kanban.
 */

type ViewMode = 'grid' | 'pipeline';

export function JobsWorkspace() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');

  const filtered = JOBS.filter((j) => {
    if (typeFilter !== 'all' && j.type !== typeFilter) return false;
    if (urgencyFilter !== 'all' && j.urgency !== urgencyFilter) return false;
    return true;
  });

  return (
    <div className="jobs-workspace">
      <header className="jw-header">
        <div className="jw-header__left">
          <h1 className="jw-header__title">Jobs & Orders</h1>
          <span className="jw-header__count">{filtered.length} active</span>
        </div>
        <div className="jw-header__controls">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="jw-filter" aria-label="Job type">
            <option value="all">All Types</option>
            <option value="per-diem">Per Diem</option>
            <option value="travel">Travel</option>
            <option value="local-contract">Local Contract</option>
            <option value="permanent">Permanent</option>
            <option value="float-pool">Float Pool</option>
          </select>
          <select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)} className="jw-filter" aria-label="Urgency">
            <option value="all">All Urgency</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
          </select>
          <div className="jw-view-toggle" role="tablist">
            <button role="tab" aria-selected={viewMode === 'grid'} className={`jw-view-btn ${viewMode === 'grid' ? 'jw-view-btn--active' : ''}`} onClick={() => setViewMode('grid')}>Grid</button>
            <button role="tab" aria-selected={viewMode === 'pipeline'} className={`jw-view-btn ${viewMode === 'pipeline' ? 'jw-view-btn--active' : ''}`} onClick={() => setViewMode('pipeline')}>Pipeline</button>
          </div>
        </div>
      </header>

      {viewMode === 'grid' ? <GridView jobs={filtered} /> : <PipelineView jobs={filtered} />}
    </div>
  );
}

function GridView({ jobs }: { jobs: DemoJob[] }) {
  return (
    <div className="jw-grid" role="table" aria-label="Jobs grid">
      <div className="jw-grid__header" role="row">
        <span role="columnheader">Role</span>
        <span role="columnheader">Facility</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Urgency</span>
        <span role="columnheader">Open</span>
        <span role="columnheader">Subs</span>
        <span role="columnheader">Pay</span>
        <span role="columnheader">Bill</span>
        <span role="columnheader">Margin</span>
        <span role="columnheader">SLA</span>
        <span role="columnheader">Fill %</span>
        <span role="columnheader">Actions</span>
      </div>
      {jobs.map((j) => (
        <div key={j.id} className={`jw-grid__row jw-grid__row--${j.urgency}`} role="row">
          <span className="jw-grid__cell jw-grid__cell--role">{j.role} - {j.specialty}</span>
          <span className="jw-grid__cell">{j.facilityName}</span>
          <span className="jw-grid__cell"><span className="jw-type-badge">{j.type}</span></span>
          <span className="jw-grid__cell"><span className={`jw-urgency jw-urgency--${j.urgency}`}>{j.urgency}</span></span>
          <span className="jw-grid__cell">{j.openPositions}</span>
          <span className="jw-grid__cell">{j.submissions}</span>
          <span className="jw-grid__cell">{formatRate(j.payRate)}</span>
          <span className="jw-grid__cell">{formatRate(j.billRate)}</span>
          <span className="jw-grid__cell">{j.margin > 0 ? `${j.margin}%` : '—'}</span>
          <span className="jw-grid__cell jw-grid__cell--sla">{j.slaDeadline}</span>
          <span className="jw-grid__cell"><span className={`jw-fill ${j.fillProbability < 50 ? 'jw-fill--low' : ''}`}>{j.fillProbability}%</span></span>
          <span className="jw-grid__cell"><button className="jw-action-btn">Match</button></span>
        </div>
      ))}
    </div>
  );
}

function PipelineView({ jobs }: { jobs: DemoJob[] }) {
  const stages = [
    { label: 'New', filter: (j: DemoJob) => j.submissions === 0 },
    { label: 'Sourcing', filter: (j: DemoJob) => j.submissions > 0 && j.submissions < 3 },
    { label: 'Submitted', filter: (j: DemoJob) => j.submissions >= 3 },
  ];

  return (
    <div className="jw-pipeline">
      {stages.map((stage) => (
        <div key={stage.label} className="jw-pipeline__column">
          <h3 className="jw-pipeline__title">{stage.label} ({jobs.filter(stage.filter).length})</h3>
          <div className="jw-pipeline__cards">
            {jobs.filter(stage.filter).map((j) => (
              <article key={j.id} className={`jw-pipeline-card jw-pipeline-card--${j.urgency}`}>
                <span className="jw-pipeline-card__role">{j.role} - {j.specialty}</span>
                <span className="jw-pipeline-card__facility">{j.facilityName}</span>
                <div className="jw-pipeline-card__meta">
                  <span>{j.openPositions} positions</span>
                  <span>SLA: {j.slaDeadline}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
