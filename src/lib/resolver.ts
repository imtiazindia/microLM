import { debriefs, findDebriefByStudentId, instructors, manifest, permissions, students, vocabulary } from './data';
import type {
  Debrief,
  ExtractedSlots,
  Instructor,
  ManifestDestination,
  ParserUsed,
  ResolutionResult,
  Role,
  StructuredInterpretation,
  Student
} from '../types';

const DEFAULT_CFI_INSTRUCTOR = 'Sarah Collins';

const destinationById = (id?: string) =>
  manifest.find((destination) => destination.id === id || destination.title.toLowerCase() === String(id).toLowerCase());

const byName = (value = '') => value.toLowerCase();
const exactStudent = (name?: string) => students.find((student) => byName(student.name) === byName(name));
const exactInstructor = (name?: string) => instructors.find((instructor) => byName(instructor.name) === byName(name));
const activeRiskFlags = (student: Student) => student.riskFlags.filter((flag) => flag !== 'Within Standard');
const hasTrainingTopic = (student: Student, topic: string) => student.lessonHistory.some((lesson) => lesson.toLowerCase().includes(topic.toLowerCase()));

function matchingStudents(slots: ExtractedSlots): Student[] {
  if (slots.studentName) {
    const exact = exactStudent(slots.studentName);
    if (exact) return [exact];
  }
  if (slots.studentLastName) {
    return students.filter((student) => byName(student.name).endsWith(` ${byName(slots.studentLastName)}`));
  }
  return [];
}

function isAssignedToRole(role: Role, student?: Student): boolean {
  if (!student || role !== 'CFI') return true;
  return student.instructor === DEFAULT_CFI_INSTRUCTOR;
}

function checkPermission(role: Role, destination?: ManifestDestination, student?: Student): ResolutionResult['permissionOutcome'] {
  if (!destination) return 'not_required';
  const rolePermissions = permissions[role];
  const required = destination.requiredPermission;
  if (required && !rolePermissions[required]) return 'denied';
  if (destination.id === 'manifest-viewer' && !rolePermissions['manifest.view']) return 'denied';
  if (student && !isAssignedToRole(role, student)) return 'denied';
  return required || destination.id === 'manifest-viewer' || student ? 'allowed' : 'not_required';
}

function routeWithFilters(path: string, filters: Record<string, string | string[]>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function filtersFromSlots(destinationId: string, slots: ExtractedSlots) {
  const filters: Record<string, string | string[]> = {};
  if (slots.instructorName) filters.instructor = slots.instructorName;
  if (slots.dateRange) filters.dateRange = slots.dateRange;
  if (slots.riskCategory) filters.riskCategory = slots.riskCategory;
  if (slots.clearedRiskCategory) filters.clearedRiskCategory = slots.clearedRiskCategory;
  if (slots.noRiskFlags) filters.noRiskFlags = slots.noRiskFlags;
  if (slots.highestRiskFlags) filters.highestRiskFlags = slots.highestRiskFlags;
  if (slots.stage) filters.stage = slots.stage;
  if (slots.soloReadiness) filters.soloReadiness = slots.soloReadiness;
  if (slots.status) filters.status = slots.status;

  if (destinationId === 'student-roster') {
    if (slots.status === 'Not Yet Solo Ready') filters.soloReadiness = ['Not Yet Solo Ready', 'Not Yet Ready'];
    if (slots.status === 'Needs Review') filters.status = ['Needs Review', 'Remedial Required'];
    if (slots.riskCategory) filters.riskCategory = slots.riskCategory;
  }

  if (destinationId === 'stage-check') {
    filters.stageCheckReadiness = slots.status === 'Stage Check Ready' ? 'Stage Check Ready' : slots.status || '';
    delete filters.status;
  }

  if (destinationId === 'risk-dashboard' && slots.riskCategory === 'Landing Performance Issue') {
    filters.riskCategory = vocabulary.riskFamilies['Landing Performance Issue'];
  }

  return Object.fromEntries(Object.entries(filters).filter(([, value]) => Array.isArray(value) || Boolean(value)));
}

function studentsMatchingLocalFilters(slots: ExtractedSlots): Student[] {
  const highestRiskCount = Math.max(...students.map((student) => activeRiskFlags(student).length));
  return students.filter((student) => {
    if (slots.instructorName && student.instructor !== slots.instructorName) return false;
    if (slots.stage && student.stage !== slots.stage) return false;
    if (slots.soloReadiness === 'Ready' && student.soloReadiness !== 'Ready') return false;
    if (slots.soloReadiness === 'Not Yet' && !student.soloReadiness.includes('Not Yet')) return false;
    if (slots.status === 'Not Yet Solo Ready' && !['Not Yet Solo Ready', 'Not Yet Ready'].includes(student.soloReadiness)) return false;
    else if (slots.status === 'Stage Check Ready' && student.stageCheckReadiness !== 'Stage Check Ready') return false;
    else if (slots.status && !['Not Yet Solo Ready', 'Stage Check Ready'].includes(slots.status) && student.status !== slots.status) return false;
    if (slots.riskCategory) {
      const riskSet = slots.riskCategory === 'Landing Performance Issue' ? vocabulary.riskFamilies['Landing Performance Issue'] : [slots.riskCategory];
      if (!riskSet.some((risk) => student.riskFlags.includes(risk))) return false;
    }
    if (slots.clearedRiskCategory) {
      if (activeRiskFlags(student).includes(slots.clearedRiskCategory)) return false;
      if (!hasTrainingTopic(student, slots.clearedRiskCategory)) return false;
    }
    if (slots.noRiskFlags && activeRiskFlags(student).length > 0) return false;
    if (slots.highestRiskFlags && activeRiskFlags(student).length !== highestRiskCount) return false;
    return true;
  });
}

function latestDebriefForStudent(student?: Student) {
  return student ? findDebriefByStudentId(student.id) : undefined;
}

function debriefsForDate(dateRange?: string): Debrief[] {
  if (!dateRange || dateRange === 'latest' || dateRange === 'last') return [];
  return debriefs.filter((debrief) => debrief.dateLabel === dateRange);
}

function chooseDestination(interpretation: StructuredInterpretation): ManifestDestination | undefined {
  if (interpretation.unsafe) return undefined;
  if (interpretation.intentType === 'metrics_query' || interpretation.destinationHint === 'local-metrics') return undefined;
  if (interpretation.intentType === 'student_fact_query' || interpretation.destinationHint === 'student-fact') return undefined;
  const hinted = destinationById(interpretation.destinationHint);
  if (hinted) return hinted;
  if (interpretation.intentType === 'task_launch') return destinationById('remedial-plan');
  if (interpretation.intentType === 'record_open') return destinationById('debrief-records');
  if (interpretation.slots.status === 'Stage Check Ready') return destinationById('stage-check');
  if (interpretation.slots.riskCategory) return destinationById('risk-dashboard');
  return destinationById('student-roster');
}

function resolveStudentFactQuery(command: string, interpretation: StructuredInterpretation, parserUsed: ParserUsed, role: Role): ResolutionResult {
  const result = baseResult(command, interpretation, parserUsed);
  const matches = matchingStudents(interpretation.slots);
  result.resolvedEntities.students = matches.length ? matches : undefined;

  if (matches.length > 1) {
    result.responseState = 'disambiguation_required';
    result.alternatives = matches.map((student) => ({
      id: student.id,
      label: `${student.name} - ${student.stage}, ${student.instructor}`,
      route: `/students/${student.id}`
    }));
    result.handoffMessage = `Multiple matches found for ${interpretation.slots.studentLastName}. Choose the student record to continue.`;
    return result;
  }

  const student = matches[0];
  if (!student) {
    result.responseState = 'not_found';
    result.handoffMessage = 'I understood this as a student data question, but no matching local student was found.';
    return result;
  }

  result.resolvedEntities.student = student;
  const permission = checkPermission(role, destinationById('student-profile'), student);
  result.permissionOutcome = permission;
  if (permission === 'denied') {
    result.responseState = 'permission_denied';
    result.handoffMessage = `You do not have permission to view ${student.name}'s student details with the current ${role} role.`;
    return result;
  }

  const debrief = latestDebriefForStudent(student);
  const factType = interpretation.slots.factType;
  const facts: Record<string, { label: string; value: string }> = {
    stageCheckReadiness: { label: 'stage check readiness', value: student.stageCheckReadiness },
    soloReadiness: { label: 'solo readiness', value: student.soloReadiness },
    riskFlags: { label: 'active risk flags', value: student.riskFlags.length ? student.riskFlags.join(', ') : 'none active' },
    instructor: { label: 'assigned instructor', value: student.instructor },
    stage: { label: 'training stage', value: student.stage },
    status: { label: 'training status', value: student.status },
    latestDebrief: { label: 'latest debrief', value: debrief ? `${debrief.lesson} (${debrief.dateLabel})` : 'no local debrief found' }
  };

  const fact = factType ? facts[factType] : undefined;
  if (!fact) {
    result.responseState = 'clarification_required';
    result.handoffMessage = `I found ${student.name}, but need a clearer field: stage check readiness, solo readiness, instructor, stage, status, risk flags, or latest debrief.`;
    return result;
  }

  result.responseState = 'resolved';
  result.intentType = 'student_fact_query';
  result.matchedDestinationId = 'student-fact';
  result.matchedDestinationTitle = 'Student Local Fact Answer';
  result.appliedFilters = { student: student.name, factType: factType || 'unknown' };
  result.handoffMessage = `I understood this as a local student data question. ${student.name}'s ${fact.label} is ${fact.value}.`;
  result.debugNotes.push('Answered from local static student/debrief JSON. No model-generated student fact was trusted.');
  return result;
}

function resolveMetricsQuery(command: string, interpretation: StructuredInterpretation, parserUsed: ParserUsed): ResolutionResult {
  const result = baseResult(command, interpretation, parserUsed);
  const metric = interpretation.slots.metric;
  const filteredStudents = studentsMatchingLocalFilters(interpretation.slots);
  const hasStudentFilters = Boolean(
    interpretation.slots.instructorName ||
      interpretation.slots.stage ||
      interpretation.slots.riskCategory ||
      interpretation.slots.status
  );
  const filteredNote = hasStudentFilters ? 'Counted after applying local student filters.' : 'Counted from the bundled local students JSON.';
  const metricValues: Record<string, { label: string; value: number; note: string }> = {
    totalStudents: {
      label: hasStudentFilters ? 'matching students' : 'total students',
      value: hasStudentFilters ? filteredStudents.length : students.length,
      note: filteredNote
    },
    totalDebriefs: {
      label: 'total debrief records',
      value: debriefs.length,
      note: 'Counted from the bundled local debriefs JSON.'
    },
    remedialRequired: {
      label: 'students marked remedial required',
      value: studentsMatchingLocalFilters({ ...interpretation.slots, status: 'Remedial Required' }).length,
      note: 'Filtered by local student status.'
    },
    needsReview: {
      label: 'students needing review',
      value: studentsMatchingLocalFilters({ ...interpretation.slots, status: 'Needs Review' }).length,
      note: 'Filtered by local student status.'
    },
    stageCheckReady: {
      label: 'students ready for stage check',
      value: studentsMatchingLocalFilters({ ...interpretation.slots, status: 'Stage Check Ready' }).length,
      note: 'Filtered by local stage check readiness.'
    },
    notSoloReady: {
      label: 'students not yet solo ready',
      value: studentsMatchingLocalFilters({ ...interpretation.slots, status: 'Not Yet Solo Ready' }).length,
      note: 'Filtered by local solo readiness.'
    }
  };

  const resolvedMetric = metric ? metricValues[metric] : undefined;
  if (!resolvedMetric) {
    result.responseState = 'clarification_required';
    result.handoffMessage = 'I can answer local count questions about students, debriefs, remedial status, review status, stage check readiness, or solo readiness.';
    result.debugNotes.push('Metrics query was detected, but no supported metric was extracted.');
    return result;
  }

  result.responseState = 'resolved';
  result.intentType = 'metrics_query';
  result.matchedDestinationId = 'local-metrics';
  result.matchedDestinationTitle = 'Local Metrics Answer';
  result.appliedFilters = filtersFromSlots('student-roster', interpretation.slots);
  result.appliedFilters.metric = metric || 'unknown';
  result.handoffMessage = `I understood this as a local data question. There are ${resolvedMetric.value} ${resolvedMetric.label}. ${resolvedMetric.note}`;
  result.debugNotes.push('Answered from local static JSON data. No model-generated numeric answer was trusted.');
  return result;
}

function baseResult(
  command: string,
  interpretation: StructuredInterpretation,
  parserUsed: ParserUsed,
  destination?: ManifestDestination
): ResolutionResult {
  return {
    responseState: 'clarification_required',
    parserUsed,
    rawCommand: command,
    intentType: interpretation.intentType,
    confidence: interpretation.confidence,
    matchedDestinationId: destination?.id,
    matchedDestinationTitle: destination?.title,
    extractedSlots: interpretation.slots,
    resolvedEntities: {},
    appliedFilters: {},
    prefillContext: {},
    permissionOutcome: 'not_required',
    handoffMessage: '',
    alternatives: [],
    debugNotes: [...(interpretation.notes || [])],
    timestamp: new Date().toISOString()
  };
}

export function resolveIntent(command: string, interpretation: StructuredInterpretation, parserUsed: ParserUsed, role: Role): ResolutionResult {
  if (interpretation.intentType === 'metrics_query' || interpretation.destinationHint === 'local-metrics') {
    return resolveMetricsQuery(command, interpretation, parserUsed);
  }
  if (interpretation.intentType === 'student_fact_query' || interpretation.destinationHint === 'student-fact') {
    return resolveStudentFactQuery(command, interpretation, parserUsed, role);
  }

  const destination = chooseDestination(interpretation);
  const result = baseResult(command, interpretation, parserUsed, destination);

  if (interpretation.unsafe || command.toLowerCase().includes('delete')) {
    result.responseState = 'clarification_required';
    result.handoffMessage = 'This PoC does not support destructive actions through iBar.';
    result.debugNotes.push('Unsafe/destructive action blocked before route handoff.');
    return result;
  }

  if (!destination || interpretation.intentType === 'unknown') {
    result.responseState = 'clarification_required';
    result.handoffMessage = 'I understood part of the request, but need a clearer student, record, workflow, or approved destination.';
    return result;
  }

  const matches = matchingStudents(interpretation.slots);
  const student = matches.length === 1 ? matches[0] : undefined;
  const instructor = exactInstructor(interpretation.slots.instructorName);
  result.resolvedEntities.students = matches.length ? matches : undefined;
  result.resolvedEntities.student = student;
  result.resolvedEntities.instructor = instructor;

  if (matches.length > 1) {
    result.responseState = 'disambiguation_required';
    result.permissionOutcome = 'not_required';
    result.alternatives = matches.map((match) => {
      const debrief = latestDebriefForStudent(match);
      return {
        id: match.id,
        label: `${match.name} - ${match.stage}, ${match.instructor}`,
        route: destination.id === 'debrief-records' && debrief ? `/debriefs/${debrief.id}` : `/students/${match.id}`
      };
    });
    result.handoffMessage = `Multiple matches found for ${interpretation.slots.studentLastName}. Choose the student record to continue.`;
    return result;
  }

  const permission = checkPermission(role, destination, student);
  result.permissionOutcome = permission;
  if (permission === 'denied') {
    result.responseState = 'permission_denied';
    result.handoffMessage =
      destination.id === 'remedial-plan'
        ? `I understood that you want to start a remedial plan for ${student?.name || interpretation.slots.studentName || 'this student'}, but the current ${role} role does not have permission to create remedial plans.`
        : `You do not have permission to open ${destination.title} with the current ${role} role.`;
    result.debugNotes.push('Permission layer blocked the handoff.');
    return result;
  }

  if (destination.id === 'debrief-records' && interpretation.intentType === 'record_open') {
    let debrief = latestDebriefForStudent(student);
    const dateMatches = debriefsForDate(interpretation.slots.dateRange);
    if (!debrief && dateMatches.length === 1) debrief = dateMatches[0];
    if (!debrief && dateMatches.length > 1) {
      result.responseState = 'disambiguation_required';
      result.alternatives = dateMatches.map((item) => ({ id: item.id, label: `${item.studentName} - ${item.lesson}`, route: `/debriefs/${item.id}` }));
      result.handoffMessage = `Multiple matches found for ${interpretation.slots.dateRange}. Choose a debrief to continue.`;
      return result;
    }
    if (!debrief) {
      result.responseState = 'not_found';
      result.handoffMessage = 'I understood the debrief request, but no matching local debrief record was found.';
      return result;
    }
    result.responseState = 'resolved';
    result.resolvedEntities.debrief = debrief;
    result.route = `/debriefs/${debrief.id}`;
    result.appliedFilters = { student: debrief.studentName, dateRange: interpretation.slots.dateRange || 'latest' };
    result.handoffMessage = `Opening ${debrief.studentName}'s ${interpretation.slots.recordType || 'latest debrief'}.`;
    return result;
  }

  if (destination.id === 'student-profile') {
    if (!student) {
      result.responseState = 'not_found';
      result.handoffMessage = 'I understood the student profile request, but no matching local student was found.';
      return result;
    }
    result.responseState = 'resolved';
    result.route = `/students/${student.id}`;
    result.handoffMessage = `Opening ${student.name}'s student profile.`;
    return result;
  }

  if (destination.id === 'remedial-plan') {
    if (!student) {
      result.responseState = 'not_found';
      result.handoffMessage = 'I understood the remedial plan request, but no matching local student was found.';
      return result;
    }
    const debrief = latestDebriefForStudent(student);
    result.responseState = 'resolved';
    result.route = routeWithFilters('/remedial/new', {
      studentId: student.id,
      riskCategory: interpretation.slots.riskCategory || interpretation.slots.maneuver || '',
      sourceDebriefId: debrief?.id || ''
    });
    result.prefillContext = {
      studentId: student.id,
      studentName: student.name,
      instructorName: student.instructor,
      riskCategory: interpretation.slots.riskCategory || interpretation.slots.maneuver,
      maneuver: interpretation.slots.maneuver,
      sourceDebriefId: debrief?.id
    };
    result.resolvedEntities.debrief = debrief;
    result.handoffMessage = `Opening remedial plan wizard for ${student.name}. This action requires review before any simulated submission.`;
    return result;
  }

  const filters = filtersFromSlots(destination.id, interpretation.slots);
  result.responseState = 'resolved';
  result.appliedFilters = filters;
  result.route = routeWithFilters(destination.route || '/', filters);
  result.handoffMessage = `Showing ${destination.title}${Object.keys(filters).length ? ' with the requested local filters applied.' : '.'}`;
  return result;
}
