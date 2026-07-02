import { manifest, students, vocabulary } from '../lib/data';
import type { ModelStatus, StructuredInterpretation } from '../types';

type TextGenerationPipeline = (messages: Array<{ role: string; content: string }>, options: Record<string, unknown>) => Promise<unknown>;

type WorkerRequest =
  | { id: number; type: 'load' }
  | { id: number; type: 'interpret'; command: string };

const ALLOWED_KEYS = new Set(['intentType', 'slots', 'confidence', 'destinationHint', 'unsafe', 'notes']);

let generator: TextGenerationPipeline | null = null;
let loading: Promise<void> | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'load') {
    void loadModel(message.id);
  }
  if (message.type === 'interpret') {
    void interpret(message.id, message.command);
  }
};

async function loadModel(id: number) {
  try {
    await ensureModel(id);
    postLoaded(id);
  } catch (error) {
    postError(id, error, 'Failed');
  }
}

async function interpret(id: number, command: string) {
  try {
    await ensureModel(id);
    if (!generator) throw new Error('Local microLM generator unavailable.');
    const result = await generator([{ role: 'user', content: buildPrompt(command) }], {
      max_new_tokens: 96,
      temperature: 0.1,
      do_sample: false,
      return_full_text: false
    });
    const text = extractText(result);
    const interpretation = validateInterpretation(text);
    self.postMessage({ id, type: 'interpretation', interpretation });
  } catch (error) {
    postError(id, error);
  }
}

async function ensureModel(id: number) {
  if (generator) return;

  if (!loading) {
    postStatus(id, 'Loading');
    loading = import('@huggingface/transformers')
      .then(async (transformers) => {
        const { pipeline, env } = transformers as unknown as {
          pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<unknown>;
          env: { allowLocalModels: boolean; allowRemoteModels: boolean };
        };
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        generator = (await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct', {
          dtype: 'q4',
          device: 'wasm'
        })) as TextGenerationPipeline;
      });
  }

  await loading;
}

function buildPrompt(command: string) {
  const manifestNames = manifest.map((destination) => destination.title).join(', ');
  const studentsList = students.map((student) => student.name).join(', ');
  const vocabularyList = [...vocabulary.maneuvers, ...vocabulary.statuses, ...Object.values(vocabulary.synonyms)].join(', ');
  return [
    'You classify constrained iBar commands for a fictional flight-school UI.',
    'You are not an aviation advisor. Do not make safety decisions. Do not invent students, records, routes, or training recommendations.',
    `Allowed destination names: ${manifestNames}.`,
    `Allowed students: ${studentsList}.`,
    `Allowed vocabulary: ${vocabularyList}.`,
    'Return only compact JSON with keys: intentType, slots, confidence, destinationHint, unsafe, notes.',
    'intentType must be one of navigation, record_open, task_launch, metrics_query, student_fact_query, clarification_required, unknown.',
    'For count questions, use intentType metrics_query and set slots.metric to one of totalStudents, totalDebriefs, remedialRequired, needsReview, stageCheckReady, notSoloReady. Also extract instructorName, stage, riskCategory, soloReadiness, noRiskFlags, highestRiskFlags, clearedRiskCategory, and status filters when present.',
    'For student-specific factual questions, use intentType student_fact_query and set slots.factType to one of stageCheckReadiness, soloReadiness, riskFlags, instructor, stage, status, latestDebrief.',
    'slots may include studentName, studentLastName, instructorName, maneuver, riskCategory, clearedRiskCategory, noRiskFlags, highestRiskFlags, dateRange, stage, status, soloReadiness, workflow, targetScreen, recordType, metric, factType.',
    `Command: ${command}`
  ].join('\n');
}

function extractText(result: unknown): string {
  if (Array.isArray(result)) {
    const first = result[0] as Record<string, unknown>;
    const generated = first.generated_text;
    if (typeof generated === 'string') return generated;
    if (Array.isArray(generated)) {
      const last = generated[generated.length - 1] as Record<string, unknown>;
      if (typeof last?.content === 'string') return last.content;
    }
  }
  if (typeof result === 'string') return result;
  return JSON.stringify(result);
}

function validateInterpretation(text: string): StructuredInterpretation {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Local microLM did not return JSON.');
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  Object.keys(parsed).forEach((key) => {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`Unsupported model field: ${key}`);
  });

  const intentType = parsed.intentType;
  if (!['navigation', 'record_open', 'task_launch', 'metrics_query', 'student_fact_query', 'clarification_required', 'unknown'].includes(String(intentType))) {
    throw new Error('Unsupported intent type.');
  }
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Invalid confidence.');
  if (parsed.destinationHint && !manifest.some((destination) => destination.id === parsed.destinationHint || destination.title === parsed.destinationHint)) {
    throw new Error('Model suggested a destination outside the manifest.');
  }

  const slots = typeof parsed.slots === 'object' && parsed.slots ? (parsed.slots as StructuredInterpretation['slots']) : {};
  return {
    intentType: intentType as StructuredInterpretation['intentType'],
    slots,
    confidence,
    destinationHint: typeof parsed.destinationHint === 'string' ? parsed.destinationHint : undefined,
    unsafe: Boolean(parsed.unsafe),
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : ['Local microLM output validated before resolver handoff.']
  };
}

function postStatus(id: number, status: ModelStatus) {
  self.postMessage({ id, type: 'status', status });
}

function postLoaded(id: number) {
  self.postMessage({ id, type: 'loaded' });
}

function postError(id: number, error: unknown, status?: ModelStatus) {
  self.postMessage({ id, type: 'error', error: error instanceof Error ? error.message : String(error), status });
}

export {};
