import { useState } from 'react';

/**
 * Executive Workforce Command Center
 *
 * The primary CEO and investor "wow" screen.
 * Shows a live enterprise view of the entire healthcare workforce operation.
 */

// Typed demo data model
interface CommandCenterData {
  workforce: { active: number; available: number; onAssignment: number; blocked: number };
  demand: { openShifts: number; urgentShifts: number; fillRate: number; avgTimeToFill: number };
  financial: { revenueThisMonth: number; grossMargin: number; payrollExposure: number };
  credentials: { ready: number; expiring: number; blocked: number; pendingVerification: number };
  funnel: { newCandidates: number; screening: number; credentialing: number; ready: number };
  cancellation: { todayRisk: number; thisWeekRisk: number; noShowRate: number };
  clients: { active: number; atRisk: number; topClient: string; topClientFillRate: number };
  geographic: Array<{ region: string; demand: number; supply: number; gap: number }>;
  aiBriefing: string;
  exceptions: Array<{ type: string; message: string; severity: 'critical' | 'warning' | 'info' }>;
  actions: Array<{ label: string; impact: string; priority: 'high' | 'medium' | 'low' }>;
}

// Realistic demo data
const DEMO_DATA: CommandCenterData = {
  workforce: { active: 2847, available: 1203, onAssignment: 1644, blocked: 89 },
  demand: { openShifts: 342, urgentShifts: 47, fillRate: 87.3, avgTimeToFill: 4.2 },
  financial: { revenueThisMonth: 4_280_000, grossMargin: 23.4, payrollExposure: 890_000 },
  credentials: { ready: 2156, expiring: 134, blocked: 89, pendingVerification: 67 },
  funnel: { newCandidates: 89, screening: 234, credentialing: 156, ready: 412 },
  cancellation: { todayRisk: 12, thisWeekRisk: 34, noShowRate: 3.2 },
  clients: { active: 48, atRisk: 3, topClient: 'Mercy Health System', topClientFillRate: 94.1 },
  geographic: [
    { region: 'Northeast', demand: 128, supply: 142, gap: -14 },
    { region: 'Southeast', demand: 97, supply: 78, gap: 19 },
    { region: 'Midwest', demand: 64, supply: 58, gap: 6 },
    { region: 'West Coast', demand: 53, supply: 61, gap: -8 },
  ],
  aiBriefing:
    'Fill rate has improved 2.1% this week. Three Southeast facilities are at risk of missing SLA targets due to credential gaps. 47 urgent shifts need coverage in the next 48 hours. Recommend prioritizing Mercy General and Baptist Memorial credentialing queues.',
  exceptions: [
    { type: 'CREDENTIAL', message: '12 RN licenses expiring within 7 days', severity: 'critical' },
    { type: 'FILL_RATE', message: 'Baptist Memorial below 80% fill rate (SLA threshold)', severity: 'critical' },
    { type: 'CANCELLATION', message: '5 shifts at high cancellation risk for tomorrow', severity: 'warning' },
    { type: 'PAYROLL', message: '$23,400 in unresolved timecard exceptions', severity: 'warning' },
    { type: 'FUNNEL', message: '34 candidates stalled in credentialing > 14 days', severity: 'info' },
  ],
  actions: [
    { label: 'Resolve 12 expiring RN licenses', impact: 'Prevents $180K revenue loss', priority: 'high' },
    { label: 'Fill 47 urgent shifts', impact: '$94K immediate revenue', priority: 'high' },
    { label: 'Address Baptist Memorial SLA', impact: 'Client retention risk', priority: 'high' },
    { label: 'Process timecard exceptions', impact: '$23.4K payroll accuracy', priority: 'medium' },
    { label: 'Unstall credentialing queue', impact: '34 candidates to ready-to-work', priority: 'medium' },
  ],
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function CommandCenter() {
  const [data] = useState<CommandCenterData>(DEMO_DATA);
  const [timeFilter, setTimeFilter] = useState('this-week');

  return (
    <div className="command-center">
      {/* Page header */}
      <header className="cc-header">
        <div className="cc-header__left">
          <h1 className="cc-header__title">Workforce Command Center</h1>
          <p className="cc-header__subtitle">Enterprise-wide operational intelligence</p>
        </div>
        <div className="cc-header__filters">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="cc-filter-select"
            aria-label="Time period"
          >
            <option value="today">Today</option>
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>
      </header>

      {/* AI Briefing */}
      <section className="cc-briefing" aria-labelledby="ai-briefing-heading">
        <div className="cc-briefing__icon">✦</div>
        <div className="cc-briefing__content">
          <h2 id="ai-briefing-heading" className="cc-briefing__title">AI Executive Briefing</h2>
          <p className="cc-briefing__text">{data.aiBriefing}</p>
        </div>
      </section>

      {/* Primary KPIs */}
      <section className="cc-kpis" aria-label="Key performance indicators">
        <div className="cc-kpi cc-kpi--primary">
          <span className="cc-kpi__label">Active Workforce</span>
          <span className="cc-kpi__value">{formatNumber(data.workforce.active)}</span>
          <span className="cc-kpi__detail">{formatNumber(data.workforce.onAssignment)} on assignment</span>
        </div>
        <div className="cc-kpi cc-kpi--primary">
          <span className="cc-kpi__label">Open Demand</span>
          <span className="cc-kpi__value">{formatNumber(data.demand.openShifts)}</span>
          <span className="cc-kpi__detail cc-kpi__detail--urgent">{data.demand.urgentShifts} urgent</span>
        </div>
        <div className="cc-kpi cc-kpi--success">
          <span className="cc-kpi__label">Fill Rate</span>
          <span className="cc-kpi__value">{data.demand.fillRate}%</span>
          <span className="cc-kpi__detail">↑ 2.1% vs last week</span>
        </div>
        <div className="cc-kpi">
          <span className="cc-kpi__label">Avg Time-to-Fill</span>
          <span className="cc-kpi__value">{data.demand.avgTimeToFill}h</span>
          <span className="cc-kpi__detail">Target: 6h</span>
        </div>
        <div className="cc-kpi">
          <span className="cc-kpi__label">Revenue (MTD)</span>
          <span className="cc-kpi__value">{formatCurrency(data.financial.revenueThisMonth)}</span>
          <span className="cc-kpi__detail">{data.financial.grossMargin}% margin</span>
        </div>
        <div className="cc-kpi cc-kpi--warning">
          <span className="cc-kpi__label">Credential Ready</span>
          <span className="cc-kpi__value">{formatNumber(data.credentials.ready)}</span>
          <span className="cc-kpi__detail">{data.credentials.expiring} expiring soon</span>
        </div>
      </section>

      {/* Two-column layout: Exceptions + Actions */}
      <div className="cc-two-col">
        {/* Operational Exceptions */}
        <section className="cc-panel" aria-labelledby="exceptions-heading">
          <h2 id="exceptions-heading" className="cc-panel__title">Operational Exceptions</h2>
          <ul className="cc-exceptions" role="list">
            {data.exceptions.map((exc, i) => (
              <li key={i} className={`cc-exception cc-exception--${exc.severity}`} role="listitem">
                <span className="cc-exception__badge">{exc.type}</span>
                <span className="cc-exception__message">{exc.message}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Recommended Actions */}
        <section className="cc-panel" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="cc-panel__title">Today's Recommended Actions</h2>
          <ul className="cc-actions" role="list">
            {data.actions.map((action, i) => (
              <li key={i} className={`cc-action cc-action--${action.priority}`} role="listitem">
                <div className="cc-action__content">
                  <span className="cc-action__label">{action.label}</span>
                  <span className="cc-action__impact">{action.impact}</span>
                </div>
                <button className="cc-action__btn">→</button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Geographic Demand */}
      <section className="cc-panel" aria-labelledby="geo-heading">
        <h2 id="geo-heading" className="cc-panel__title">Geographic Staffing Demand</h2>
        <div className="cc-geo-grid">
          {data.geographic.map((region) => (
            <div key={region.region} className="cc-geo-card">
              <span className="cc-geo-card__region">{region.region}</span>
              <div className="cc-geo-card__stats">
                <span>Demand: <strong>{region.demand}</strong></span>
                <span>Supply: <strong>{region.supply}</strong></span>
                <span className={region.gap > 0 ? 'cc-geo-card__gap--negative' : 'cc-geo-card__gap--positive'}>
                  Gap: {region.gap > 0 ? '+' : ''}{region.gap}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Funnel */}
      <section className="cc-panel" aria-labelledby="funnel-heading">
        <h2 id="funnel-heading" className="cc-panel__title">Candidate Pipeline</h2>
        <div className="cc-funnel">
          <div className="cc-funnel__stage">
            <span className="cc-funnel__count">{data.funnel.newCandidates}</span>
            <span className="cc-funnel__label">New</span>
          </div>
          <div className="cc-funnel__arrow">→</div>
          <div className="cc-funnel__stage">
            <span className="cc-funnel__count">{data.funnel.screening}</span>
            <span className="cc-funnel__label">Screening</span>
          </div>
          <div className="cc-funnel__arrow">→</div>
          <div className="cc-funnel__stage">
            <span className="cc-funnel__count">{data.funnel.credentialing}</span>
            <span className="cc-funnel__label">Credentialing</span>
          </div>
          <div className="cc-funnel__arrow">→</div>
          <div className="cc-funnel__stage cc-funnel__stage--ready">
            <span className="cc-funnel__count">{data.funnel.ready}</span>
            <span className="cc-funnel__label">Ready to Work</span>
          </div>
        </div>
      </section>
    </div>
  );
}
