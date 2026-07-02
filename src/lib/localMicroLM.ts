import type { ModelStatus, StructuredInterpretation } from '../types';

type WorkerRequest =
  | { id: number; type: 'load' }
  | { id: number; type: 'interpret'; command: string };
type WorkerRequestPayload =
  | { type: 'load' }
  | { type: 'interpret'; command: string };

type WorkerResponse =
  | { id: number; type: 'status'; status: ModelStatus }
  | { id: number; type: 'loaded' }
  | { id: number; type: 'interpretation'; interpretation: StructuredInterpretation }
  | { id: number; type: 'error'; error: string; status?: ModelStatus };

const INFERENCE_TIMEOUT_MS = 3500;

export class LocalMicroLMAdapter {
  private worker: Worker | null = null;
  private requestId = 0;
  private statusListener?: (status: ModelStatus) => void;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout?: number;
    }
  >();

  public status: ModelStatus = 'Not loaded';

  async load(onStatus?: (status: ModelStatus) => void) {
    this.statusListener = onStatus;
    this.ensureWorker();
    if (this.status === 'Ready' || this.status === 'Loading') return;
    this.setStatus('Loading');
    await this.request<void>({ type: 'load' });
  }

  async interpret(command: string): Promise<StructuredInterpretation> {
    if (!this.worker || this.status !== 'Ready') {
      throw new Error('Local microLM is not ready.');
    }
    return this.request<StructuredInterpretation>({ type: 'interpret', command }, INFERENCE_TIMEOUT_MS);
  }

  private ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../workers/microLmWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      console.warn('Local microLM worker failed; fallback parser remains active.', event.message);
      this.rejectAll(new Error(event.message));
      this.terminateWorker('Failed');
    };
  }

  private request<T>(payload: WorkerRequestPayload, timeoutMs?: number): Promise<T> {
    this.ensureWorker();
    const id = ++this.requestId;
    const message = { ...payload, id } as WorkerRequest;
    return new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs
        ? window.setTimeout(() => {
            this.pending.delete(id);
            reject(new Error('Local microLM inference timed out; fallback parser used.'));
            this.terminateWorker('Fallback active');
          }, timeoutMs)
        : undefined;
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
      this.worker?.postMessage(message);
    });
  }

  private handleMessage(message: WorkerResponse) {
    if (message.type === 'status') {
      this.setStatus(message.status);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (pending.timeout) window.clearTimeout(pending.timeout);

    if (message.type === 'loaded') {
      this.setStatus('Ready');
      pending.resolve(undefined);
      return;
    }

    if (message.type === 'interpretation') {
      pending.resolve(message.interpretation);
      return;
    }

    if (message.type === 'error') {
      if (message.status) this.setStatus(message.status);
      pending.reject(new Error(message.error));
    }
  }

  private rejectAll(error: Error) {
    this.pending.forEach((pending) => {
      if (pending.timeout) window.clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pending.clear();
  }

  private terminateWorker(status: ModelStatus) {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error(`Local microLM worker stopped with status ${status}.`));
    this.setStatus(status);
  }

  private setStatus(status: ModelStatus) {
    this.status = status;
    this.statusListener?.(status);
  }
}

export const localMicroLM = new LocalMicroLMAdapter();
