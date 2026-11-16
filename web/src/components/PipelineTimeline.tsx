import { useId, useState } from 'react';
import type { Outlook, Pipeline, TraceEntry } from '../lib/api';
import { formatDate } from '../lib/format';
import { ExplainBadge } from './ExplainBadge';
import { Markdown } from './Markdown';

/**
 * Step-by-step timeline of the pipeline: Source Finder -> Data Collector -> Fact-Checker -> Predictor ->
 * explanation on Amazon Bedrock -> governance check. Every step shows only what the API returned (sources,
 * checks, trace entries); nothing is invented client-side. Steps appear one after the other (CSS, disabled
 * with prefers-reduced-motion) and each expands on demand.
 */

type Status = 'ok' | 'warn';

interface StepDef {
  id: string;
  agent: string;
  title: string;
  summary: string;
  status: Status;
  body: React.ReactNode;
  trace: TraceEntry[];
}

const PRIMITIVE_MAX = 160;

/** Scalars as "key : value", anything nested as a compact, truncated JSON. */
function describeValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > PRIMITIVE_MAX ? v.slice(0, PRIMITIVE_MAX) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const j = JSON.stringify(v);
  return j.length > PRIMITIVE_MAX ? j.slice(0, PRIMITIVE_MAX) + '…' : j;
}

function KeyValues({ label, data, skip = [] }: { label: string; data?: Record<string, unknown>; skip?: string[] }) {
  const entries = Object.entries(data ?? {}).filter(([k]) => !skip.includes(k));
  if (entries.length === 0) return null;
  return (
    <dl className="trace__kv" aria-label={label}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{describeValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TraceList({ entries }: { entries: TraceEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <details className="trace" data-testid="trace-details">
      <summary>
        Trace d’exécution ({entries.length} appel{entries.length > 1 ? 's' : ''})
      </summary>
      <ol>
        {entries.map((t, i) => (
          <li key={i}>
            <p className="trace__head">
              <code>{t.tool ?? t.step}</code>
              {t.ms !== undefined && <small> · {t.ms} ms</small>}
            </p>
            <KeyValues label={`Entrées de ${t.tool ?? t.step}`} data={t.inputs} />
            <KeyValues label={`Sorties de ${t.tool ?? t.step}`} data={t.outputs} skip={['ranking']} />
          </li>
        ))}
      </ol>
    </details>
  );
}

function buildSteps(pipeline: Pipeline, outlook?: Pick<Outlook, 'method' | 'sensitivity_summary'>): StepDef[] {
  const { sources, fact_check: fc, data, explanation: ex } = pipeline;
  const trace = pipeline.trace ?? [];
  const by = (agent: string) => trace.filter((t) => t.agent === agent);
  const finder = by('source_finder')[0]?.outputs;
  const ranking = (Array.isArray(finder?.ranking) ? finder.ranking : []) as { id: string; why: string }[];
  const why = new Map(ranking.map((r) => [r.id, r.why]));
  const rank = (id: string) => ranking.findIndex((r) => r.id === id) + 1 || 99;
  const orderedSources = [...sources].sort((a, b) => rank(a.id) - rank(b.id));
  const failed = fc.checks.filter((c) => !c.ok).length;
  const gov = ex.governance;
  const used = new Set(['source_finder', 'data_collector', 'fact_checker', 'predictor', 'explainer']);
  const other = trace.filter((t) => !used.has(t.agent));

  const steps: StepDef[] = [
    {
      id: 'finder',
      agent: 'source_finder',
      title: 'Source Finder',
      summary: `${sources.length} source${sources.length > 1 ? 's' : ''} retenue${sources.length > 1 ? 's' : ''}`,
      status: sources.length > 0 ? 'ok' : 'warn',
      trace: by('source_finder'),
      body: (
        <>
          <p className="tl__lead">
            Où sont les données ? {finder && typeof finder.mode === 'string' && <ExplainBadge mode={finder.mode === 'bedrock' ? 'bedrock' : 'offline'} />}
          </p>
          <ol className="ranking" data-testid="source-ranking">
            {orderedSources.map((src) => {
              const meta = [src.kind, src.license, src.as_of && `au ${formatDate(src.as_of)}`].filter(Boolean).join(' · ');
              return (
                <li key={src.id}>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noopener noreferrer">
                      {src.name}
                    </a>
                  ) : (
                    src.name
                  )}
                  {meta && <small> ({meta})</small>}
                  {why.get(src.id) && <small className="block">Rôle : {why.get(src.id)}</small>}
                  {src.chosen_because && <small className="block">Choisie parce que : {src.chosen_because}</small>}
                </li>
              );
            })}
          </ol>
        </>
      ),
    },
    {
      id: 'collector',
      agent: 'data_collector',
      title: 'Data Collector',
      summary: data.currency ? `prix en ${data.currency}, fenêtre et lacunes` : 'fenêtre et lacunes',
      status: data.missing_days ? 'warn' : 'ok',
      trace: by('data_collector'),
      body: (
        <>
          <p>
            {data.start && data.end ? `${formatDate(data.start)} → ${formatDate(data.end)}` : 'Fenêtre non précisée'}
            {data.n_obs !== undefined && ` · ${data.n_obs.toLocaleString('fr-FR')} observations`}
            {data.missing_days !== undefined && ` · ${data.missing_days} jours manquants`}
            {data.currency && ` · ${data.currency}`}
          </p>
          {data.notes && data.notes.length > 0 && (
            <ul>
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    {
      id: 'checker',
      agent: 'fact_checker',
      title: 'Fact-Checker',
      summary: `${fc.checks.length - failed} / ${fc.checks.length} vérifications passées`,
      status: fc.passed ? 'ok' : 'warn',
      trace: by('fact_checker'),
      body: (
        <>
          <p className="tl__lead">
            <span className={'badge ' + (fc.passed ? 'badge--ok' : 'badge--ko')}>{fc.passed ? 'toutes passées' : 'à revoir'}</span>
          </p>
          <ul className="checks">
            {fc.checks.map((c) => (
              <li key={c.name} className={c.ok ? 'check--ok' : 'check--ko'}>
                <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
                <span className="sr-only">{c.ok ? 'Réussi : ' : 'Échoué : '}</span>
                <span>
                  {c.name}
                  {c.detail && <small className="block">{c.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'predictor',
      agent: 'predictor',
      title: 'Predictor',
      summary: 'trois scénarios hypothétiques',
      status: 'ok',
      trace: by('predictor'),
      body: (
        <>
          {outlook?.method && <p>{outlook.method}</p>}
          {outlook?.sensitivity_summary && <p>{outlook.sensitivity_summary}</p>}
          {!outlook?.method && <p>Scénarios calculés par le code ; voir « Méthode, hypothèses et limites ».</p>}
        </>
      ),
    },
    {
      id: 'explainer',
      agent: 'explainer',
      title: 'Explication (Amazon Bedrock)',
      summary: ex.mode === 'bedrock' ? 'rédigée par Claude sur Amazon Bedrock' : 'texte de secours déterministe',
      status: 'ok',
      trace: by('explainer'),
      body: (
        <>
          <p className="tl__lead">
            <ExplainBadge mode={ex.mode} />
          </p>
          {ex.long && ex.long !== ex.short ? <Markdown text={ex.long} /> : <Markdown text={ex.short} />}
        </>
      ),
    },
    {
      id: 'governance',
      agent: 'governance',
      title: 'Contrôle de gouvernance',
      summary: gov.passed ? 'conforme' : 'à revoir',
      status: gov.passed ? 'ok' : 'warn',
      trace: [],
      body: (
        <>
          <p className="tl__lead">
            <span className={'badge ' + (gov.passed ? 'badge--ok' : 'badge--ko')}>{gov.passed ? 'Gouvernance : conforme' : 'Gouvernance : à revoir'}</span>
          </p>
          {gov.attempts_log && gov.attempts_log.length > 0 && (
            <ul className="attempts" data-testid="attempts">
              {gov.attempts_log.map((a) => (
                <li key={a.attempt} className={a.passed ? 'check--ok' : 'check--ko'}>
                  Tentative {a.attempt} : {a.passed ? 'validée' : `refusée${a.issues && a.issues.length ? ` (${a.issues.join(' ; ')})` : ''}`}
                </li>
              ))}
              {gov.numbers_checked !== undefined && <li>{gov.numbers_checked} nombres vérifiés dans la trace de calcul.</li>}
              {gov.fell_back_to_deterministic && <li>Texte de secours utilisé après les tentatives refusées.</li>}
            </ul>
          )}
          {gov.issues && gov.issues.length > 0 && (
            <ul>
              {gov.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </>
      ),
    },
  ];
  if (other.length > 0) {
    steps.push({
      id: 'other',
      agent: 'other',
      title: 'Autres étapes de la trace',
      summary: `${other.length} appel${other.length > 1 ? 's' : ''}`,
      status: 'ok',
      trace: other,
      body: <p>Étapes supplémentaires enregistrées par le serveur.</p>,
    });
  }
  return steps;
}

export function PipelineTimeline({ pipeline, outlook }: { pipeline: Pipeline; outlook?: Pick<Outlook, 'method' | 'sensitivity_summary'> }) {
  const uid = useId();
  const steps = buildSteps(pipeline, outlook);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allOpen = open.size === steps.length;
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const total = pipeline.trace?.reduce((a, t) => a + (t.ms ?? 0), 0) ?? 0;

  return (
    <div className="tl" data-testid="pipeline-timeline">
      <p className="tl__top">
        <span>
          {steps.length} étapes{total > 0 && ` · ${Math.round(total).toLocaleString('fr-FR')} ms de calcul tracé`}
        </span>
        <button type="button" className="link-btn link-btn--dark" onClick={() => setOpen(allOpen ? new Set() : new Set(steps.map((s) => s.id)))}>
          {allOpen ? 'Tout replier' : 'Tout déplier'}
        </button>
      </p>
      <ol className="tl__list">
        {steps.map((s, i) => {
          const isOpen = open.has(s.id);
          const bodyId = `${uid}-${s.id}`;
          return (
            <li key={s.id} className={`tl__step tl__step--${s.status}${isOpen ? ' is-open' : ''}`} style={{ ['--i' as string]: i }} data-testid={`step-${s.id}`}>
              <span className="tl__dot" aria-hidden="true">
                {s.status === 'ok' ? '✓' : '!'}
              </span>
              <button type="button" className="tl__head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(s.id)}>
                <span className="tl__title">
                  {i + 1}. {s.title}
                </span>
                <span className="tl__summary">{s.summary}</span>
                <span className="tl__chev" aria-hidden="true">
                  ▾
                </span>
              </button>
              <div id={bodyId} className="tl__body">
                <div className="tl__inner">
                  {s.body}
                  <TraceList entries={s.trace} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
