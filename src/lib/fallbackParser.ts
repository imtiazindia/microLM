import { instructors, manifest, students, vocabulary } from './data';
import type { ExtractedSlots, StructuredInterpretation } from '../types';

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));
const normalize = (value: string) => value.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();

function matchStudent(text: string): Pick<ExtractedSlots, 'studentName' | 'studentLastName'> {
  const normalized = normalize(text);
  const exact = students.find((student) => normalized.includes(normalize(student.name)));
  if (exact) return { studentName: exact.name };

  const first = students.find((student) => normalized.includes(normalize(student.name.split(' ')[0])));
  if (first) return { studentName: first.name };

  const lastNames = students.map((student) => student.name.split(' ').slice(-1)[0]);
  const last = lastNames.find((lastName) => normalized.includes(normalize(lastName)));
  return last ? { studentLastName: last } : {};
}

function matchInstructor(text: string): string | undefined {
  const normalized = normalize(text);
  return instructors.find((instructor) => {
    const instructorName = normalize(instructor.name);
    const firstName = normalize(instructor.name.split(' ')[0]);
    return normalized.includes(instructorName) || normalized.includes(`${firstName} s`) || normalized.includes(firstName);
  })?.name;
}

function matchDateRange(text: string): string | undefined {
  const normalized = normalize(text);
  return vocabulary.dateRanges.find((range) => normalized.includes(range));
}

function matchStage(text: string): string | undefined {
  const normalized = normalize(text);
  if (includesAny(normalized, ['stage 1', 'stage one'])) return 'Stage 1';
  if (includesAny(normalized, ['stage 2', 'stage two'])) return 'Stage 2';
  if (includesAny(normalized, ['stage 3', 'stage three'])) return 'Stage 3';
  return undefined;
}

function matchVocabulary(text: string): Pick<
  ExtractedSlots,
  'maneuver' | 'riskCategory' | 'clearedRiskCategory' | 'noRiskFlags' | 'highestRiskFlags' | 'status' | 'soloReadiness' | 'recordType' | 'workflow'
> {
  const normalized = normalize(text);
  const slots: ExtractedSlots = {};

  for (const [phrase, target] of Object.entries(vocabulary.synonyms)) {
    if (normalized.includes(phrase)) {
      if (target === 'Latest Debrief') slots.recordType = 'latest debrief';
      else if (target === 'Remedial Plan') slots.workflow = 'Remedial Plan';
      else if (vocabulary.statuses.includes(target)) slots.status = target;
      else slots.riskCategory = target;
    }
  }

  const maneuver = vocabulary.maneuvers.find((item) => normalized.includes(normalize(item)) || normalized.includes(normalize(item.replace('-', ' '))));
  if (maneuver) {
    slots.maneuver = maneuver;
    if (!slots.riskCategory) slots.riskCategory = maneuver;
  }

  const status = vocabulary.statuses.find((item) => normalized.includes(normalize(item)));
  if (status) slots.status = status;

  if (normalized.includes('needing review') || normalized.includes('needs review')) slots.status = 'Needs Review';
  if (includesAny(normalized, ['remedial required', 'need remedial', 'needs remedial', 'need remedials', 'needs remedials', 'requiring remedial'])) slots.status = 'Remedial Required';
  if (normalized.includes('ready for stage check') || normalized.includes('checkride ready')) slots.status = 'Stage Check Ready';
  if (includesAny(normalized, ['not ready for solo', 'not solo ready'])) {
    slots.status = 'Not Yet Solo Ready';
    slots.soloReadiness = 'Not Yet';
  }
  if (includesAny(normalized, ['solo ready', 'ready for solo', 'cleared solo'])) slots.soloReadiness = 'Ready';
  if (includesAny(normalized, ['without any risk flags', 'without risk flags', 'no risk flags', 'no active risk', 'clean risk'])) slots.noRiskFlags = 'true';
  if (includesAny(normalized, ['highest risk flags', 'most risk flags', 'most risks', 'highest risk'])) slots.highestRiskFlags = 'true';
  if (includesAny(normalized, ['cleared radio', 'cleared radio communication', 'passed radio', 'radio cleared'])) slots.clearedRiskCategory = 'Radio Communication';
  if (includesAny(normalized, ['radio issues', 'radio problem', 'radio problems'])) slots.riskCategory = 'Radio Communication';
  if (normalized.includes('debrief') || normalized.includes('flight notes') || normalized.includes('instructor notes')) slots.recordType = slots.recordType || 'latest debrief';
  return slots;
}

function inferDestination(text: string, slots: ExtractedSlots): string {
  const normalized = normalize(text);
  if (includesAny(normalized, ['delete', 'remove', 'destroy', 'erase'])) return 'unsafe';
  if (isMetricsQuestion(normalized)) return 'local-metrics';
  if (isStudentFactQuestion(normalized, slots)) return 'student-fact';
  if ((slots.studentName || slots.studentLastName) && slots.factType) return 'student-fact';
  if (isDebriefListQuestion(normalized, slots)) return 'debrief-records';
  if (isRosterListQuestion(normalized, slots)) return 'student-roster';
  if (slots.workflow === 'Remedial Plan' || includesAny(normalized, ['start remedial', 'correction plan', 'extra training', 'intervention'])) return 'remedial-plan';
  if (includesAny(normalized, ['debrief', 'flight notes', 'instructor notes'])) return 'debrief-records';
  if (includesAny(normalized, ['risk', 'weak', 'issues', 'concerns', 'problem', 'landing'])) return 'risk-dashboard';
  if (includesAny(normalized, ['stage check', 'checkride', 'evaluation readiness'])) return 'stage-check';
  if (includesAny(normalized, ['students', 'student', 'roster', 'solo', 'needing review', 'need remedial', 'needs remedial', 'need remedials', 'needs remedials'])) return 'student-roster';

  const manifestHit = manifest.find((destination) => destination.aliases.some((alias) => normalized.includes(alias)));
  return manifestHit?.id || 'dashboard';
}

function isRosterListQuestion(normalized: string, slots: ExtractedSlots): boolean {
  const asksForPeople = includesAny(normalized, ['who', 'which students', 'list', 'show', 'find', 'students']);
  const hasRosterFilter = Boolean(
    slots.instructorName ||
      slots.stage ||
      slots.status ||
      slots.soloReadiness ||
      slots.riskCategory ||
      slots.clearedRiskCategory ||
      slots.noRiskFlags ||
      slots.highestRiskFlags ||
      includesAny(normalized, ['assigned', 'with ', 'students'])
  );
  return asksForPeople && hasRosterFilter;
}

function isDebriefListQuestion(normalized: string, slots: ExtractedSlots): boolean {
  return Boolean(slots.dateRange) && includesAny(normalized, ['flew', 'flight', 'lesson', 'debrief', 'notes']);
}

function isStudentFactQuestion(normalized: string, slots: ExtractedSlots): boolean {
  return Boolean(slots.studentName || slots.studentLastName) && includesAny(normalized, ['what is', "what's", 'who is', 'which instructor', 'tell me', 'status of', 'readiness of']);
}

function isMetricsQuestion(normalized: string): boolean {
  return includesAny(normalized, ['how many', 'count', 'total number', 'number of']) && includesAny(normalized, ['student', 'students', 'debrief', 'debriefs', 'remedial', 'stage check', 'solo', 'risk', 'issues']);
}

function matchMetric(text: string): string | undefined {
  const normalized = normalize(text);
  if (includesAny(normalized, ['remedial required', 'need remedial', 'needs remedial'])) return 'remedialRequired';
  if (includesAny(normalized, ['needs review', 'needing review'])) return 'needsReview';
  if (includesAny(normalized, ['stage check ready', 'ready for stage check', 'checkride ready'])) return 'stageCheckReady';
  if (includesAny(normalized, ['not solo ready', 'not ready for solo'])) return 'notSoloReady';
  if (includesAny(normalized, ['solo ready', 'ready for solo', 'cleared solo'])) return 'totalStudents';
  if (includesAny(normalized, ['without risk flags', 'no risk flags', 'highest risk flags', 'most risk flags', 'cleared radio'])) return 'totalStudents';
  if (includesAny(normalized, ['how many debrief', 'total debrief', 'number of debrief', 'debrief count'])) return 'totalDebriefs';
  if (includesAny(normalized, ['how many students', 'total students', 'total number of students', 'number of students', 'student count', 'how many stage'])) return 'totalStudents';
  return undefined;
}

function matchFactType(text: string): string | undefined {
  const normalized = normalize(text);
  if (includesAny(normalized, ['stage check status', 'stage check readiness', 'checkride readiness'])) return 'stageCheckReadiness';
  if (includesAny(normalized, ['solo readiness', 'solo status', 'solo ready'])) return 'soloReadiness';
  if (includesAny(normalized, ['risk flags', 'risk flag', 'risks', 'weak areas', 'issues'])) return 'riskFlags';
  if (includesAny(normalized, ['instructor', 'cfi'])) return 'instructor';
  if (includesAny(normalized, ['stage'])) return 'stage';
  if (includesAny(normalized, ['status'])) return 'status';
  if (includesAny(normalized, ['latest debrief', 'last debrief', 'last flight notes'])) return 'latestDebrief';
  return undefined;
}

export function fallbackParse(command: string): StructuredInterpretation {
  const normalized = normalize(command);
  const slots: ExtractedSlots = {
    ...matchStudent(command),
    instructorName: matchInstructor(command),
    dateRange: matchDateRange(command),
    stage: matchStage(command),
    ...matchVocabulary(command),
    metric: matchMetric(command),
    factType: matchFactType(command)
  };
  if (!slots.dateRange && (slots.recordType === 'latest debrief' || normalized.includes('last'))) slots.dateRange = 'latest';

  const destinationHint = inferDestination(command, slots);
  const unsafe = destinationHint === 'unsafe';
  let intentType: StructuredInterpretation['intentType'] = 'navigation';

  if (unsafe) intentType = 'clarification_required';
  else if (destinationHint === 'local-metrics') intentType = 'metrics_query';
  else if (destinationHint === 'student-fact') intentType = 'student_fact_query';
  else if (destinationHint === 'remedial-plan') intentType = 'task_launch';
  else if (destinationHint === 'debrief-records' && !slots.studentName && !slots.studentLastName && includesAny(normalized, ['show', 'list', 'find', 'who']) && !normalized.includes('open'))
    intentType = 'navigation';
  else if (
    destinationHint === 'debrief-records' &&
    (slots.studentName || slots.studentLastName || normalized.includes('open') || slots.recordType === 'latest debrief')
  )
    intentType = 'record_open';
  else if (destinationHint === 'student-profile') intentType = 'record_open';
  else if (!includesAny(normalized, ['show', 'open', 'find', 'start', 'go', 'view', 'list', 'which', 'who', 'students'])) intentType = 'unknown';

  let confidence = 0.55;
  if (destinationHint && destinationHint !== 'dashboard') confidence += 0.15;
  if (slots.studentName || slots.studentLastName || slots.instructorName || slots.stage) confidence += 0.1;
  if (slots.riskCategory || slots.clearedRiskCategory || slots.noRiskFlags || slots.highestRiskFlags || slots.soloReadiness || slots.status || slots.recordType || slots.workflow) confidence += 0.1;
  if (slots.metric) confidence += 0.15;
  if (slots.factType) confidence += 0.15;
  if (unsafe) confidence = 0.95;

  return {
    intentType,
    slots,
    confidence: Math.min(confidence, 0.96),
    destinationHint: unsafe ? undefined : destinationHint,
    unsafe,
    notes: ['Deterministic parser used lowercase matching, local entities, synonyms, dates, and manifest aliases.']
  };
}
