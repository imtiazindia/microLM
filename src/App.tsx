import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  Home,
  ListChecks,
  Plane,
  RefreshCw,
  Search,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Users
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  debriefs,
  demoCommands,
  findDebriefByStudentId,
  findStudentById,
  instructors,
  manifest,
  organization,
  permissions,
  students,
  vocabulary
} from './lib/data';
import { fallbackParse } from './lib/fallbackParser';
import { getFeedbackEvents, storeFeedback } from './lib/feedback';
import { localMicroLM } from './lib/localMicroLM';
import { getQuestionHistory, QUESTION_HISTORY_LIMIT, storeQuestion } from './lib/questionHistory';
import { resolveIntent } from './lib/resolver';
import { addTelemetry } from './lib/telemetry';
import type { FeedbackEvent, ModelStatus, QuestionEvent, ResolutionResult, Role, Student, TelemetryEvent } from './types';

const roles: Role[] = ['Chief Instructor', 'CFI', 'Training Manager', 'Principal'];
const LOCAL_MODEL_NAME = 'SmolLM2-360M-Instruct';
const LOCAL_MODEL_PROVIDER = 'HuggingFaceTB';
const LOCAL_MODEL_RUNTIME = 'Transformers.js + WASM';
const LOCAL_MODEL_EXECUTION = 'Browser Web Worker';
const LOCAL_MODEL_TIMEOUT = '3.5s';
const TRANSIENT_STORAGE_KEYS = [
  'demo-role',
  'model-status',
  'last-ibar-result',
  'last-ibar-command',
  'flight-school-local-ibar-telemetry',
  'remedial-objective'
];
const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/debriefs', label: 'Debriefs', icon: FileText },
  { to: '/risk', label: 'Risk Dashboard', icon: AlertTriangle },
  { to: '/stage-check', label: 'Stage Check', icon: ClipboardCheck },
  { to: '/remedial/new', label: 'Remedial Plans', icon: ListChecks },
  { to: '/manifest', label: 'Manifest Viewer', icon: Database }
];

function useQueryFilters() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function statusTone(value: string) {
  if (['Ready', 'Stage Check Ready', 'Within Standard', 'Progressing'].includes(value)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['Needs Review', 'Not Yet Ready', 'Not Yet Solo Ready'].includes(value)) return 'bg-amber-50 text-amber-800 ring-amber-200';
  if (['Remedial Required', 'Failed', 'Fallback active'].includes(value)) return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function Badge({ children, tone }: { children: string; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone || statusTone(children)}`}>{children}</span>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-panel ${className}`}>{children}</section>;
}

function App() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('Chief Instructor');
  const [modelStatus, setModelStatus] = useState<ModelStatus>('Not loaded');
  const [lastResult, setLastResult] = useState<ResolutionResult | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [feedbackEvents, setFeedbackEvents] = useState<FeedbackEvent[]>(() => getFeedbackEvents());
  const [feedbackByResult, setFeedbackByResult] = useState<Record<string, FeedbackEvent['rating']>>({});
  const [questionEvents, setQuestionEvents] = useState<QuestionEvent[]>(() => getQuestionHistory());

  useEffect(() => {
    TRANSIENT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    void localMicroLM.load(setModelStatus);
  }, []);

  async function runCommand(command: string, options: { navigateOnResolved?: boolean } = { navigateOnResolved: true }) {
    setQuestionEvents(storeQuestion(command));
    const startedAt = performance.now();
    const modelStatusAtStart = localMicroLM.status;
    const localModelAttempted = modelStatusAtStart === 'Ready';
    let interpretation = null;
    let parserUsed: 'Local microLM' | 'Fallback parser' = 'Fallback parser';

    if (localMicroLM.status === 'Ready') {
      try {
        interpretation = await localMicroLM.interpret(command);
        parserUsed = 'Local microLM';
      } catch {
        interpretation = fallbackParse(command);
        parserUsed = 'Fallback parser';
        setModelStatus(localMicroLM.status === 'Ready' ? 'Fallback active' : localMicroLM.status);
      }
    } else {
      interpretation = fallbackParse(command);
      parserUsed = 'Fallback parser';
      if (localMicroLM.status === 'Failed') setModelStatus('Fallback active');
    }

    const result = resolveIntent(command, interpretation, parserUsed, role);
    const durationMs = Math.round(performance.now() - startedAt);
    setLastResult(result);
    setTelemetry((current) => addTelemetry(result, current, { durationMs, modelStatusAtStart, localModelAttempted }));
    if (options.navigateOnResolved !== false && result.responseState === 'resolved' && result.route) {
      navigate(result.route, { state: { handoffMessage: result.handoffMessage } });
    }
    return result;
  }

  function recordFeedback(result: ResolutionResult, rating: FeedbackEvent['rating']) {
    setFeedbackEvents(storeFeedback(result, rating));
    setFeedbackByResult((current) => ({ ...current, [result.timestamp]: rating }));
  }

  return (
    <div className="min-h-screen bg-[#eef3f7]">
      <Header role={role} setRole={setRole} modelStatus={modelStatus} retryModel={() => void localMicroLM.load(setModelStatus)} />
      <div className="mx-auto flex max-w-[1500px] gap-6 px-4 py-5 lg:px-6">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-64 shrink-0 rounded-lg border border-slate-200 bg-white p-3 shadow-panel lg:block">
          <Nav />
          <LocalModeCard modelStatus={modelStatus} lastResult={lastResult} telemetry={telemetry} feedbackCount={feedbackEvents.length} compact />
        </aside>
        <main className="min-w-0 flex-1">
          <MobileNav />
          <IBar
            onSubmit={runCommand}
            modelStatus={modelStatus}
            lastResult={lastResult}
            onFeedback={recordFeedback}
            feedbackRating={lastResult ? feedbackByResult[lastResult.timestamp] : undefined}
          />
          <Routes>
            <Route path="/" element={<Dashboard onRunCommand={runCommand} modelStatus={modelStatus} lastResult={lastResult} telemetry={telemetry} />} />
            <Route path="/students" element={<StudentRoster />} />
            <Route path="/students/:studentId" element={<StudentProfile onRunCommand={runCommand} />} />
            <Route path="/debriefs" element={<DebriefRecords />} />
            <Route path="/debriefs/:debriefId" element={<DebriefDetail />} />
            <Route path="/risk" element={<RiskDashboard />} />
            <Route path="/stage-check" element={<StageCheckReadiness />} />
            <Route path="/remedial/new" element={<RemedialPlanWizard />} />
            <Route
              path="/manifest"
              element={
                <ManifestViewer
                  role={role}
                  lastResult={lastResult}
                  telemetry={telemetry}
                  feedbackEvents={feedbackEvents}
                  questionEvents={questionEvents}
                  onRunCommand={runCommand}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Header({
  role,
  setRole,
  modelStatus,
  retryModel
}: {
  role: Role;
  setRole: (role: Role) => void;
  modelStatus: ModelStatus;
  retryModel: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 overflow-hidden px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-tower text-white">
            <Plane size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-ink">{organization.product}</p>
            <p className="text-sm text-slate-600">{organization.subtitle}</p>
            <p className="max-w-[calc(100vw-5.5rem)] text-xs font-medium leading-5 text-slate-500">
              <span className="block sm:inline">{organization.school}</span>
              <span className="hidden sm:inline"> · </span>
              <span className="block sm:inline">{organization.airport}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-panel px-3 py-2 text-sm">
            <span className="font-semibold text-slate-600">Role</span>
            <select className="focus-ring rounded-md border border-slate-200 bg-white px-2 py-1" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {roles.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <Badge tone={statusTone(modelStatus)}>{modelStatus}</Badge>
          <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">Cloud LLM calls: 0</Badge>
          <button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" onClick={retryModel}>
            <RefreshCw size={16} /> Retry model
          </button>
        </div>
      </div>
    </header>
  );
}

function Nav() {
  return (
    <nav className="space-y-1">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
              isActive ? 'bg-tower text-white' : 'text-slate-700 hover:bg-slate-100'
            }`
          }
        >
          <Icon size={18} /> {label}
        </NavLink>
      ))}
    </nav>
  );
}

function MobileNav() {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
      {navItems.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-tower text-white' : 'bg-white text-slate-700'}`
          }
        >
          {label}
        </NavLink>
      ))}
    </div>
  );
}

function IBar({
  onSubmit,
  modelStatus,
  lastResult,
  onFeedback,
  feedbackRating
}: {
  onSubmit: (command: string) => Promise<ResolutionResult>;
  modelStatus: ModelStatus;
  lastResult: ResolutionResult | null;
  onFeedback: (result: ResolutionResult, rating: FeedbackEvent['rating']) => void;
  feedbackRating?: FeedbackEvent['rating'];
}) {
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const examples = [
    'Show students with unstable approach issues this week',
    "Open Emma Johnson's last debrief",
    'Start remedial training for Noah Carter on crosswind landings',
    'Show students ready for stage check',
    "Open Miller's debrief"
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setBusy(true);
    try {
      await onSubmit(command.trim());
      setCommand('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5 border-tower/20">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Local iBar</h1>
          <p className="text-sm text-slate-600">
            {modelStatus === 'Ready'
              ? 'Local microLM ready. Resolver still validates every handoff.'
              : modelStatus === 'Failed' || modelStatus === 'Fallback active'
                ? 'Local model unavailable. Demo is running with deterministic fallback parser.'
                : 'Preparing local aviation intent model. Fallback parser is available now.'}
          </p>
        </div>
        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">No backend · static data</Badge>
      </div>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-slate-400" size={19} />
          <input
            className="focus-ring w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-base"
            placeholder={`Try: "${examples[0]}"`}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
          />
        </div>
        <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-tower px-5 py-3 font-bold text-white hover:bg-[#0f5963]" disabled={busy}>
          {busy ? 'Resolving...' : 'Run iBar'} <ArrowRight size={18} />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.slice(1).map((example) => (
          <button key={example} className="focus-ring rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200" onClick={() => setCommand(example)}>
            {example}
          </button>
        ))}
      </div>
      {lastResult && <HandoffBanner result={lastResult} onFeedback={onFeedback} feedbackRating={feedbackRating} />}
    </Card>
  );
}

function HandoffBanner({
  result,
  onFeedback,
  feedbackRating
}: {
  result: ResolutionResult;
  onFeedback: (result: ResolutionResult, rating: FeedbackEvent['rating']) => void;
  feedbackRating?: FeedbackEvent['rating'];
}) {
  const tone =
    result.responseState === 'resolved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : result.responseState === 'permission_denied'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-amber-200 bg-amber-50 text-amber-900';
  const upSelected = feedbackRating === 'up';
  const downSelected = feedbackRating === 'down';
  return (
    <div className={`mt-4 rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-bold">{result.handoffMessage}</p>
          <p className="mt-1 text-sm">
            Parser used: {result.parserUsed} · Intent: {result.intentType} · Confidence: {Math.round(result.confidence * 100)}% · State: {result.responseState}
          </p>
        </div>
        {result.route && <Badge tone="bg-white/80 text-slate-700 ring-slate-200">{result.route}</Badge>}
      </div>
      {result.alternatives.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {result.alternatives.map((alternative) => (
            <Link key={alternative.id} className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-tower shadow-sm" to={alternative.route}>
              {alternative.label}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 border-t border-current/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold">Did you get info?</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
              upSelected ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100'
            }`}
            aria-label="Yes, the iBar gave useful information"
            aria-pressed={upSelected}
            title="Useful answer"
            onClick={() => onFeedback(result, 'up')}
          >
            <ThumbsUp size={17} />
          </button>
          <button
            type="button"
            className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
              downSelected ? 'border-rose-500 bg-rose-600 text-white' : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-100'
            }`}
            aria-label="No, the iBar did not give useful information"
            aria-pressed={downSelected}
            title="Needs improvement"
            onClick={() => onFeedback(result, 'down')}
          >
            <ThumbsDown size={17} />
          </button>
          {feedbackRating && <span className="text-xs font-semibold text-slate-700">Feedback stored locally for simulated LM training.</span>}
        </div>
      </div>
    </div>
  );
}

function LocalModeCard({
  modelStatus,
  lastResult,
  telemetry,
  feedbackCount,
  compact = false
}: {
  modelStatus: ModelStatus;
  lastResult: ResolutionResult | null;
  telemetry: TelemetryEvent[];
  feedbackCount: number;
  compact?: boolean;
}) {
  const latestEvent = telemetry[0];
  const localAttempts = telemetry.filter((event) => event.localModelAttempted).length;
  const localSuccesses = telemetry.filter((event) => event.parserUsed === 'Local microLM').length;
  const fallbackCount = telemetry.filter((event) => event.parserUsed === 'Fallback parser').length;
  const avgDuration =
    telemetry.length > 0 ? Math.round(telemetry.reduce((total, event) => total + event.durationMs, 0) / telemetry.length) : 0;
  const modelPathLabel = latestEvent?.localModelAttempted ? 'LM attempted' : modelStatus === 'Ready' ? 'LM ready' : 'Fallback path';
  return (
    <div className={`${compact ? 'mt-6' : ''} rounded-lg border border-slate-200 bg-panel p-4`}>
      <div className="flex items-center gap-2 font-bold text-ink">
        <Bot size={18} /> Local AI Mode
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Browser-hosted microLM intent parsing runs in a local worker. Fallback keeps the demo responsive when loading or slow.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={statusTone(modelStatus)}>{modelStatus}</Badge>
        <Badge tone="bg-violet-50 text-violet-700 ring-violet-200">{modelPathLabel}</Badge>
        <Badge tone="bg-white text-slate-700 ring-slate-200">Cloud LLM calls: 0</Badge>
      </div>
      <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <MetricRow label="Model" value={`${LOCAL_MODEL_PROVIDER}/${LOCAL_MODEL_NAME}`} />
        <MetricRow label="Runtime" value={LOCAL_MODEL_RUNTIME} />
        <MetricRow label="Execution" value={LOCAL_MODEL_EXECUTION} />
        <MetricRow label="Timeout" value={LOCAL_MODEL_TIMEOUT} />
        <MetricRow label="Commands run" value={String(telemetry.length)} />
        <MetricRow label="LM attempts" value={String(localAttempts)} />
        <MetricRow label="LM successes" value={String(localSuccesses)} />
        <MetricRow label="Fallbacks" value={String(fallbackCount)} />
        <MetricRow label="Feedback signals" value={String(feedbackCount)} />
        <MetricRow label="Parser used" value={lastResult?.parserUsed || 'Waiting'} />
        <MetricRow label="Last state" value={lastResult?.responseState || 'No command yet'} />
        <MetricRow label="Last latency" value={latestEvent ? `${latestEvent.durationMs} ms` : '0 ms'} />
        {!compact && (
          <>
            <MetricRow label="Avg latency" value={avgDuration ? `${avgDuration} ms` : '0 ms'} />
            <MetricRow label="Status at submit" value={latestEvent?.modelStatusAtStart || 'No command'} />
            <MetricRow label="Matched target" value={lastResult?.matchedDestinationTitle || 'None'} />
            <MetricRow label="Confidence" value={lastResult ? `${Math.round(lastResult.confidence * 100)}%` : '0%'} />
            <MetricRow label="Route handoff" value={latestEvent?.routeHandoff || 'None'} />
            <MetricRow label="Cloud endpoint" value="None configured" />
          </>
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 font-bold text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-right font-bold leading-snug text-ink" title={value}>{value}</span>
    </div>
  );
}

function Dashboard({
  onRunCommand,
  modelStatus,
  lastResult,
  telemetry
}: {
  onRunCommand: (command: string) => Promise<ResolutionResult>;
  modelStatus: ModelStatus;
  lastResult: ResolutionResult | null;
  telemetry: TelemetryEvent[];
}) {
  const counts = [
    { label: 'Total students', value: students.length, icon: Users },
    { label: 'Remedial required', value: students.filter((student) => student.status === 'Remedial Required').length, icon: AlertTriangle },
    { label: 'Needs review', value: students.filter((student) => student.status === 'Needs Review').length, icon: Activity },
    { label: 'Stage check ready', value: students.filter((student) => student.stageCheckReadiness === 'Stage Check Ready').length, icon: CheckCircle2 },
    { label: 'Not yet solo ready', value: students.filter((student) => student.soloReadiness.includes('Not Yet')).length, icon: ShieldCheck }
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {counts.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">{label}</p>
              <Icon size={19} className="text-tower" />
            </div>
            <p className="mt-3 text-3xl font-bold text-ink">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-5">
        <Card>
          <h2 className="text-lg font-bold">Recent Debriefs</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {debriefs.slice(0, 5).map((debrief) => (
              <Link key={debrief.id} to={`/debriefs/${debrief.id}`} className="block py-3 hover:bg-slate-50">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-ink">{debrief.studentName}</p>
                    <p className="text-sm text-slate-600">{debrief.lesson} · {debrief.instructor}</p>
                  </div>
                  <Badge>{debrief.outcome}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <DemoCommandPanel onRunCommand={onRunCommand} />
    </div>
  );
}

function filterArray(params: URLSearchParams, key: string) {
  const all = params.getAll(key);
  const single = params.get(key);
  return all.length ? all : single ? [single] : [];
}

function studentMatchesFilters(student: Student, params: URLSearchParams) {
  const instructor = params.get('instructor');
  const status = filterArray(params, 'status');
  const solo = filterArray(params, 'soloReadiness');
  const stage = params.get('stage');
  const stageReady = params.get('stageCheckReadiness');
  const risk = filterArray(params, 'riskCategory');
  const clearedRiskCategory = params.get('clearedRiskCategory');
  const noRiskFlags = params.get('noRiskFlags');
  const highestRiskFlags = params.get('highestRiskFlags');
  const activeFlags = student.riskFlags.filter((flag) => flag !== 'Within Standard');
  const highestRiskCount = Math.max(...students.map((item) => item.riskFlags.filter((flag) => flag !== 'Within Standard').length));
  if (instructor && student.instructor !== instructor) return false;
  if (stage && student.stage !== stage) return false;
  if (status.length && !status.includes(student.status)) return false;
  if (solo.length && !solo.some((item) => (item === 'Ready' ? student.soloReadiness === 'Ready' : item === 'Not Yet' ? student.soloReadiness.includes('Not Yet') : item === student.soloReadiness))) return false;
  if (stageReady && student.stageCheckReadiness !== stageReady) return false;
  if (risk.length && !risk.some((item) => student.riskFlags.includes(item))) return false;
  if (clearedRiskCategory) {
    if (activeFlags.includes(clearedRiskCategory)) return false;
    if (!student.lessonHistory.some((lesson) => lesson.toLowerCase().includes(clearedRiskCategory.toLowerCase()))) return false;
  }
  if (noRiskFlags && activeFlags.length > 0) return false;
  if (highestRiskFlags && activeFlags.length !== highestRiskCount) return false;
  return true;
}

function FilterBanner({ params }: { params: URLSearchParams }) {
  const entries = Array.from(params.entries());
  if (!entries.length) return null;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <strong>I understood</strong> these local filters: {entries.map(([key, value]) => `${key}: ${value}`).join(', ')}
    </div>
  );
}

function StudentRoster() {
  const params = useQueryFilters();
  const visible = students.filter((student) => studentMatchesFilters(student, params));
  return (
    <Screen title="Student Roster" subtitle="Fictional training records for Pacific Horizon Flight Academy.">
      <FilterBanner params={params} />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {['Student', 'Stage', 'Instructor', 'Status', 'Solo readiness', 'Stage check', 'Active risk flags'].map((header) => (
                  <th key={header} className="px-4 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-bold text-tower"><Link to={`/students/${student.id}`}>{student.name}</Link></td>
                  <td className="px-4 py-4">{student.stage}</td>
                  <td className="px-4 py-4">{student.instructor}</td>
                  <td className="px-4 py-4"><Badge>{student.status}</Badge></td>
                  <td className="px-4 py-4"><Badge>{student.soloReadiness}</Badge></td>
                  <td className="px-4 py-4"><Badge>{student.stageCheckReadiness}</Badge></td>
                  <td className="px-4 py-4"><RiskTags flags={student.riskFlags} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Screen>
  );
}

function StudentProfile({ onRunCommand }: { onRunCommand: (command: string) => Promise<ResolutionResult> }) {
  const { studentId } = useParams();
  const student = findStudentById(studentId || '');
  if (!student) return <Screen title="Student not found"><Card>No matching local student exists.</Card></Screen>;
  const debrief = findDebriefByStudentId(student.id);
  return (
    <Screen title={student.name} subtitle={`${student.stage} · ${student.instructor}`}>
      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">Training Status</h2>
          <div className="mt-4 grid gap-3">
            <Info label="Status" value={<Badge>{student.status}</Badge>} />
            <Info label="Solo readiness" value={<Badge>{student.soloReadiness}</Badge>} />
            <Info label="Stage check readiness" value={<Badge>{student.stageCheckReadiness}</Badge>} />
            <Info label="Risk flags" value={<RiskTags flags={student.riskFlags} />} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {debrief && <Link className="rounded-lg bg-tower px-4 py-2 font-bold text-white" to={`/debriefs/${debrief.id}`}>Open latest debrief</Link>}
            <button className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700" onClick={() => onRunCommand(`Start remedial training for ${student.name} on ${student.riskFlags[0] || 'stage review'}`)}>
              Start remedial plan
            </button>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Latest Debrief Summary</h2>
          {debrief && (
            <div className="mt-4 space-y-3">
              <Info label="Lesson" value={debrief.lesson} />
              <Info label="Date" value={debrief.dateLabel} />
              <Info label="Comments" value={debrief.instructorComments} />
            </div>
          )}
          <h3 className="mt-6 font-bold">Lesson History</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {student.lessonHistory.map((lesson) => <Badge key={lesson} tone="bg-slate-100 text-slate-700 ring-slate-200">{lesson}</Badge>)}
          </div>
        </Card>
      </div>
    </Screen>
  );
}

function DebriefRecords() {
  const params = useQueryFilters();
  const studentFilter = params.get('student');
  const instructorFilter = params.get('instructor');
  const dateRange = params.get('dateRange');
  const risk = filterArray(params, 'riskCategory');
  const outcome = filterArray(params, 'status');
  const visible = debriefs.filter((debrief) => {
    if (studentFilter && debrief.studentName !== studentFilter) return false;
    if (instructorFilter && debrief.instructor !== instructorFilter) return false;
    if (dateRange && !['latest', 'last'].includes(dateRange) && debrief.dateLabel !== dateRange) return false;
    if (risk.length && !risk.some((item) => debrief.flags.includes(item))) return false;
    if (outcome.length && !outcome.includes(debrief.outcome)) return false;
    return true;
  });
  return (
    <Screen title="Debrief Records" subtitle="Static local instructor notes and lesson outcomes.">
      <FilterBanner params={params} />
      <div className="grid gap-4">
        {visible.map((debrief) => <DebriefCard key={debrief.id} debrief={debrief} />)}
      </div>
    </Screen>
  );
}

function DebriefDetail() {
  const { debriefId } = useParams();
  const debrief = debriefs.find((item) => item.id === debriefId);
  if (!debrief) return <Screen title="Debrief not found"><Card>No matching local debrief exists.</Card></Screen>;
  return (
    <Screen title={`${debrief.studentName} Debrief`} subtitle={`${debrief.lesson} · ${debrief.dateLabel}`}>
      <Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Info label="Student" value={debrief.studentName} />
          <Info label="Instructor" value={debrief.instructor} />
          <Info label="Outcome" value={<Badge>{debrief.outcome}</Badge>} />
          <Info label="Flags" value={<RiskTags flags={debrief.flags} />} />
        </div>
        <div className="mt-6 space-y-4">
          <Info label="Instructor comments" value={debrief.instructorComments} />
          <Info label="Suggested next step (static sample text only)" value={debrief.staticNextStep} />
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">The AI did not create or approve this note. It is bundled fictional sample data.</p>
        </div>
      </Card>
    </Screen>
  );
}

function DebriefCard({ debrief }: { debrief: (typeof debriefs)[number] }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to={`/debriefs/${debrief.id}`} className="text-lg font-bold text-tower">{debrief.studentName}</Link>
          <p className="text-sm text-slate-600">{debrief.lesson} · {debrief.instructor} · {debrief.dateLabel}</p>
          <p className="mt-3 text-slate-700">{debrief.instructorComments}</p>
        </div>
        <Badge>{debrief.outcome}</Badge>
      </div>
      <div className="mt-3"><RiskTags flags={debrief.flags} /></div>
    </Card>
  );
}

function RiskDashboard() {
  const params = useQueryFilters();
  const selectedRisks = filterArray(params, 'riskCategory');
  const categories = ['Unstable Approach', 'Crosswind Landing', 'Radio Communication', 'Pattern Work', 'Short-Field Landing', 'Slow Flight'];
  const expanded = selectedRisks.length ? selectedRisks : categories;
  const matching = students.filter((student) => expanded.some((risk) => student.riskFlags.includes(risk)));
  return (
    <Screen title="Risk Dashboard" subtitle="Risk flags are sample training tags, not safety determinations.">
      <FilterBanner params={params} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const affected = students.filter((student) => student.riskFlags.includes(category));
          return (
            <Card key={category}>
              <p className="font-bold text-ink">{category}</p>
              <p className="mt-2 text-3xl font-bold text-tower">{affected.length}</p>
              <p className="text-sm text-slate-600">students affected</p>
              <div className="mt-3 space-y-1 text-sm">
                {affected.map((student) => <Link key={student.id} to={`/students/${student.id}`} className="block font-semibold text-slate-700">{student.name}</Link>)}
              </div>
            </Card>
          );
        })}
      </div>
      <Card>
        <h2 className="text-lg font-bold">Matching Students</h2>
        <div className="mt-4 grid gap-3">
          {matching.map((student) => {
            const debrief = findDebriefByStudentId(student.id);
            return (
              <div key={student.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Link to={`/students/${student.id}`} className="font-bold text-tower">{student.name}</Link>
                  <RiskTags flags={student.riskFlags} />
                </div>
                {debrief && <p className="mt-2 text-sm text-slate-600">Latest debrief: <Link className="font-semibold text-tower" to={`/debriefs/${debrief.id}`}>{debrief.lesson}</Link></p>}
              </div>
            );
          })}
        </div>
      </Card>
    </Screen>
  );
}

function StageCheckReadiness() {
  const params = useQueryFilters();
  const selected = params.get('stageCheckReadiness');
  const instructor = params.get('instructor');
  const stage = params.get('stage');
  const visible = students.filter((student) => {
    if (selected && student.stageCheckReadiness !== selected) return false;
    if (instructor && student.instructor !== instructor) return false;
    if (stage && student.stage !== stage) return false;
    return true;
  });
  const groups = ['Stage Check Ready', 'Needs Review', 'Not Yet Ready'];
  return (
    <Screen title="Stage Check Readiness" subtitle="Readiness groups are static sample statuses for demo routing.">
      <FilterBanner params={params} />
      <div className="grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <Card key={group}>
            <h2 className="font-bold">{group}</h2>
            <div className="mt-3 space-y-3">
              {visible
                .filter((student) => (group === 'Needs Review' ? student.status === 'Needs Review' : student.stageCheckReadiness === group))
                .map((student) => (
                  <Link key={student.id} to={`/students/${student.id}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <p className="font-bold text-tower">{student.name}</p>
                    <p className="text-sm text-slate-600">{student.stage} · {student.instructor}</p>
                  </Link>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

function RemedialPlanWizard() {
  const params = useQueryFilters();
  const student = findStudentById(params.get('studentId') || '');
  const sourceDebrief = debriefs.find((debrief) => debrief.id === params.get('sourceDebriefId'));
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [objective, setObjective] = useState('Review training standards, perform supervised practice, and document instructor review before any signoff.');

  return (
    <Screen title="Remedial Plan Wizard" subtitle="Launch only. The user reviews every field; no backend write occurs.">
      <Card>
        <div className="mb-5 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((item) => <Badge key={item} tone={item === step ? 'bg-tower text-white ring-tower' : 'bg-slate-100 text-slate-700 ring-slate-200'}>{`Step ${item}`}</Badge>)}
        </div>
        {step === 1 && (
          <div className="space-y-4">
            <Info label="Student" value={student?.name || 'Select student'} />
            <Info label="Issue" value={params.get('riskCategory') || 'Instructor review required'} />
            <Info label="Source debrief" value={sourceDebrief ? `${sourceDebrief.lesson} (${sourceDebrief.dateLabel})` : 'None selected'} />
          </div>
        )}
        {step === 2 && (
          <label className="block">
            <span className="font-bold">Training objective</span>
            <textarea className="focus-ring mt-2 min-h-32 w-full rounded-lg border border-slate-300 p-3" value={objective} onChange={(event) => setObjective(event.target.value)} />
          </label>
        )}
        {step === 3 && <Info label="Assigned instructor" value={student?.instructor || 'Instructor review pending'} />}
        {step === 4 && (
          <div className="space-y-4">
            <Info label="Review" value={`${student?.name || 'Student'} · ${params.get('riskCategory') || 'Issue'} · ${student?.instructor || 'Instructor'}`} />
            <Info label="Objective" value={objective} />
            <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">This action requires review and does not submit or modify a real record.</p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>Back</button>
          {step < 4 ? (
            <button className="rounded-lg bg-tower px-4 py-2 font-bold text-white" onClick={() => setStep((value) => value + 1)}>Next</button>
          ) : (
            <button className="rounded-lg bg-tower px-4 py-2 font-bold text-white" onClick={() => setSubmitted(true)}>Prepare demo plan</button>
          )}
        </div>
        {submitted && <p className="mt-5 rounded-lg bg-emerald-50 p-3 font-bold text-emerald-800">Demo remedial plan prepared locally. No backend write occurred.</p>}
      </Card>
    </Screen>
  );
}

function ManifestViewer({
  role,
  lastResult,
  telemetry,
  feedbackEvents,
  questionEvents,
  onRunCommand
}: {
  role: Role;
  lastResult: ResolutionResult | null;
  telemetry: TelemetryEvent[];
  feedbackEvents: FeedbackEvent[];
  questionEvents: QuestionEvent[];
  onRunCommand: (command: string) => Promise<ResolutionResult>;
}) {
  if (!permissions[role]['manifest.view']) {
    return (
      <Screen title="Manifest Viewer">
        <Card>
          <p className="font-bold text-rose-800">You do not have permission to view manifest debug with the current {role} role.</p>
        </Card>
      </Screen>
    );
  }
  return (
    <Screen title="Manifest Viewer / iBar Debug Panel" subtitle="Approved destinations, parser trace, local permissions, telemetry, and demo tests.">
      <div className="grid gap-5 xl:grid-cols-[1fr_.95fr]">
        <Card>
          <h2 className="text-lg font-bold">Approved Manifest Destinations</h2>
          <div className="mt-4 space-y-3">
            {manifest.map((destination) => (
              <details key={destination.id} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer font-bold text-tower">{destination.title}</summary>
                <div className="mt-3 text-sm text-slate-700">
                  <p>Type: {destination.type.join(', ')}</p>
                  <p>Route: {destination.route || destination.routePattern}</p>
                  <p>Aliases: {destination.aliases.join(', ')}</p>
                  {destination.acceptedFilters && <p>Accepted filters: {destination.acceptedFilters.join(', ')}</p>}
                  {destination.acceptedPrefill && <p>Accepted prefill: {destination.acceptedPrefill.join(', ')}</p>}
                  {destination.requiredPermission && <p>Required permission: {destination.requiredPermission}</p>}
                </div>
              </details>
            ))}
          </div>
        </Card>
        <div className="space-y-5">
          <QuestionsAskedPanel questionEvents={questionEvents} />
          <DebugPanel lastResult={lastResult} telemetry={telemetry} feedbackEvents={feedbackEvents} />
          <DemoCommandPanel onRunCommand={onRunCommand} asTests />
        </div>
      </div>
    </Screen>
  );
}

function QuestionsAskedPanel({ questionEvents }: { questionEvents: QuestionEvent[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Questions asked so far</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Latest {QUESTION_HISTORY_LIMIT} saved locally</p>
        </div>
        <Badge tone="bg-white text-slate-700 ring-slate-200">{String(questionEvents.length)}</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {questionEvents.length > 0 ? (
          questionEvents.map((event, index) => (
            <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-bold text-ink">{event.question}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                #{questionEvents.length - index} · {new Date(event.timestamp).toLocaleString()}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No questions asked yet.</p>
        )}
      </div>
    </Card>
  );
}

function DebugPanel({
  lastResult,
  telemetry,
  feedbackEvents
}: {
  lastResult: ResolutionResult | null;
  telemetry: TelemetryEvent[];
  feedbackEvents: FeedbackEvent[];
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">iBar Debug Panel</h2>
      {lastResult ? (
        <div className="mt-4 space-y-3 text-sm">
          <Info label="Raw user command" value={lastResult.rawCommand} />
          <Info label="Parser used" value={lastResult.parserUsed} />
          <Info label="Intent type" value={lastResult.intentType} />
          <Info label="Extracted slots" value={<pre className="whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(lastResult.extractedSlots, null, 2)}</pre>} />
          <Info label="Matched manifest candidate" value={lastResult.matchedDestinationTitle || 'None'} />
          <Info label="Confidence score" value={`${Math.round(lastResult.confidence * 100)}%`} />
          <Info label="Permission outcome" value={lastResult.permissionOutcome} />
          <Info label="Response state" value={lastResult.responseState} />
          <Info label="Final handoff target" value={lastResult.route || 'Blocked / awaiting user choice'} />
          <Info label="Cloud LLM calls" value="0" />
          <Info label="Stored feedback signals" value={feedbackEvents.length} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Run an iBar command to see the resolver trace.</p>
      )}
      <h3 className="mt-6 font-bold">Simulated LM Feedback Store</h3>
      <div className="mt-3 space-y-2">
        {feedbackEvents.length > 0 ? (
          feedbackEvents.slice(0, 5).map((event) => (
            <div key={event.id} className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-bold">{event.rating === 'up' ? 'Thumbs up' : 'Thumbs down'} · {event.command}</p>
              <p>
                {event.parserUsed} · {event.responseState} · {Math.round(event.confidence * 100)}% · {event.route || event.matchedDestination || 'No route'}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No feedback stored yet.</p>
        )}
      </div>
      <h3 className="mt-6 font-bold">Last 10 Demo Telemetry Events</h3>
      <div className="mt-3 space-y-2">
        {telemetry.map((event) => (
          <div key={`${event.timestamp}-${event.command}`} className="rounded-lg bg-slate-50 p-3 text-xs">
            <p className="font-bold">{event.command}</p>
            <p>
              {event.parserUsed} · {event.responseState} · {Math.round(event.confidence * 100)}% · {event.durationMs} ms ·{' '}
              {event.localModelAttempted ? 'LM attempted' : `status: ${event.modelStatusAtStart}`} · {event.routeHandoff}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DemoCommandPanel({
  onRunCommand,
  asTests = false
}: {
  onRunCommand: (command: string, options?: { navigateOnResolved?: boolean }) => Promise<ResolutionResult>;
  asTests?: boolean;
}) {
  const [results, setResults] = useState<Record<string, boolean | null>>({});

  async function run(commandId: string, command: string, expected: Record<string, string>) {
    const result = await onRunCommand(command, { navigateOnResolved: !asTests });
    const passed =
      (!expected.responseState || result.responseState === expected.responseState) &&
      (!expected.routeStartsWith || Boolean(result.route?.startsWith(expected.routeStartsWith))) &&
      (!expected.studentName || result.resolvedEntities.student?.name === expected.studentName || result.resolvedEntities.debrief?.studentName === expected.studentName) &&
      (!expected.studentLastName || result.extractedSlots.studentLastName === expected.studentLastName) &&
      (!expected.riskCategory || result.extractedSlots.riskCategory === expected.riskCategory || String(result.appliedFilters.riskCategory || '').includes(expected.riskCategory)) &&
      (!expected.status || result.extractedSlots.status === expected.status || String(result.appliedFilters.stageCheckReadiness || '').includes(expected.status));
    setResults((current) => ({ ...current, [commandId]: passed }));
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">{asTests ? 'Demo Test Panel' : 'Run Demo Commands'}</h2>
      <div className="mt-4 grid gap-3">
        {demoCommands.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">{item.label}</p>
              <p className="text-sm text-slate-600">{item.command}</p>
            </div>
            <div className="flex items-center gap-2">
              {asTests && results[item.id] != null && <Badge tone={results[item.id] ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}>{results[item.id] ? 'Pass' : 'Fail'}</Badge>}
              <button className="rounded-lg bg-tower px-3 py-2 text-sm font-bold text-white" onClick={() => run(item.id, item.command, item.expected)}>
                {asTests ? 'Run test' : 'Run'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const location = useLocation();
  const handoffMessage = (location.state as { handoffMessage?: string } | null)?.handoffMessage;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {handoffMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{handoffMessage}</div>}
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-slate-800">{value}</div>
    </div>
  );
}

function RiskTags({ flags }: { flags: string[] }) {
  if (!flags.length) return <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">none active</Badge>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => <Badge key={flag} tone="bg-slate-100 text-slate-700 ring-slate-200">{flag}</Badge>)}
    </div>
  );
}

export default App;
