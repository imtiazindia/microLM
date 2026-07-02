export type Role = 'Chief Instructor' | 'CFI' | 'Training Manager' | 'Principal';

export type ModelStatus = 'Not loaded' | 'Loading' | 'Ready' | 'Failed' | 'Fallback active';
export type ParserUsed = 'Local microLM' | 'Fallback parser';
export type IntentType = 'navigation' | 'record_open' | 'task_launch' | 'metrics_query' | 'student_fact_query' | 'clarification_required' | 'unknown';
export type ResponseState =
  | 'resolved'
  | 'disambiguation_required'
  | 'permission_denied'
  | 'clarification_required'
  | 'not_found';

export interface Student {
  id: string;
  name: string;
  stage: string;
  instructor: string;
  status: string;
  riskFlags: string[];
  soloReadiness: string;
  stageCheckReadiness: string;
  lessonHistory: string[];
}

export interface Instructor {
  id: string;
  name: string;
  role: string;
  students: string[];
}

export interface Debrief {
  id: string;
  studentId: string;
  studentName: string;
  instructor: string;
  dateLabel: string;
  lesson: string;
  flags: string[];
  instructorComments: string;
  outcome: string;
  staticNextStep: string;
}

export interface ManifestDestination {
  id: string;
  title: string;
  type: IntentType[];
  route?: string;
  routePattern?: string;
  aliases: string[];
  acceptedFilters?: string[];
  acceptedPrefill?: string[];
  requiredPermission?: string;
  safetyLevel?: string;
  entityType?: string;
  requiredSlot?: string[];
}

export interface ExtractedSlots {
  studentName?: string;
  studentLastName?: string;
  instructorName?: string;
  maneuver?: string;
  riskCategory?: string;
  clearedRiskCategory?: string;
  noRiskFlags?: string;
  highestRiskFlags?: string;
  dateRange?: string;
  stage?: string;
  status?: string;
  soloReadiness?: string;
  workflow?: string;
  targetScreen?: string;
  recordType?: string;
  metric?: string;
  factType?: string;
}

export interface StructuredInterpretation {
  intentType: IntentType;
  slots: ExtractedSlots;
  confidence: number;
  destinationHint?: string;
  unsafe?: boolean;
  notes?: string[];
}

export interface ResolutionResult {
  responseState: ResponseState;
  parserUsed: ParserUsed;
  rawCommand: string;
  intentType: IntentType;
  confidence: number;
  matchedDestinationId?: string;
  matchedDestinationTitle?: string;
  extractedSlots: ExtractedSlots;
  resolvedEntities: {
    students?: Student[];
    student?: Student;
    instructor?: Instructor;
    debrief?: Debrief;
  };
  appliedFilters: Record<string, string | string[]>;
  prefillContext: Record<string, string | undefined>;
  permissionOutcome: 'allowed' | 'denied' | 'not_required';
  handoffMessage: string;
  route?: string;
  alternatives: Array<{ label: string; route: string; id: string }>;
  debugNotes: string[];
  timestamp: string;
}

export interface TelemetryEvent {
  command: string;
  parserUsed: ParserUsed;
  responseState: ResponseState;
  matchedDestination?: string;
  confidence: number;
  timestamp: string;
  routeHandoff: 'success' | 'blocked';
  durationMs: number;
  modelStatusAtStart: ModelStatus;
  localModelAttempted: boolean;
}

export interface FeedbackEvent {
  id: string;
  command: string;
  rating: 'up' | 'down';
  parserUsed: ParserUsed;
  responseState: ResponseState;
  matchedDestination?: string;
  route?: string;
  confidence: number;
  resultTimestamp: string;
  timestamp: string;
}

export interface QuestionEvent {
  id: string;
  question: string;
  timestamp: string;
}
