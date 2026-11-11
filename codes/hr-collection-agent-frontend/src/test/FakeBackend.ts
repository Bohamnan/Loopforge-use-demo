import type { ArchivedResume, ResumeListResponse } from '../types/Archive';
import type { ChatMessage, Suggestion } from '../types/Conversation';
import type { ResumeValues } from '../types/ResumeModel';
import type { SessionDetail, SessionListResponse } from '../types/Session';
import {
  applyPatch,
  errorResponse,
  fieldsToValues,
  jsonResponse,
  sampleFields,
} from './ApiMocks';

/** Injected failure or delay for matching requests (so tests never depend on timing luck). */
export interface Fault {
  /** Exact "METHOD /api/v1/path" or a RegExp tested against it. */
  match: string | RegExp;
  /** How many matching requests it applies to (default 1). */
  times?: number;
  /** Wait this long before answering (works with fake timers). */
  delayMs?: number;
  /** Answer only once this promise settles (deterministic "request in flight" tests). */
  gate?: Promise<void>;
  /** Answer with this instead of the normal behaviour. */
  response?: () => Response;
  /** Reject like a network failure. */
  networkError?: boolean;
  /**
   * Run the normal behaviour first (state changes on the "server") and only then replace the answer:
   * the request took effect but the client never learns it (the "result unknown" case behind F-03 re-read checks).
   */
  afterEffect?: boolean;
}

export interface FakeBackendOptions {
  /** Sessions already on the server when the page opens. */
  sessions?: SessionDetail[];
  /** Archived resumes already on the server. */
  resumes?: ArchivedResume[];
  faults?: Fault[];
  /** Suggestions of the assistant reply to POST /messages; default: none. */
  suggest?: (content: string) => Suggestion[];
  /** Text of the assistant reply to POST /messages; default: a fixed acknowledgement. */
  reply?: (content: string) => string;
}

const SESSION_PATH = /^\/api\/v1\/sessions\/([^/]+)(\/fields|\/messages|\/resume)?(?:\/([^/]+)\/(apply|cancel))?$/;
const RESUME_PATH = /^\/api\/v1\/resumes\/([^/]+)(\/file)?$/;

/**
 * A small in-memory backend following the OpenAPI 0.2.0 behaviour: sessions (reviewing / saved), chat with suggestions,
 * save with the idempotency key (name + phone + email) and the update candidate, archive. Synthetic data only.
 */
export class FakeBackend {
  readonly sessions = new Map<string, SessionDetail>();
  readonly resumes = new Map<string, ArchivedResume>();
  readonly requests: string[] = [];
  readonly bodies: { method: string; url: string; body: unknown }[] = [];
  /** Set to true right before a save or update response is handed back; "已保存" / "已更新" must never appear before this. */
  saveAnswered = false;
  private readonly faults: (Fault & { left: number })[];
  private readonly perRoute = new Map<string, number>();
  private clock = Date.parse('2026-11-10T09:00:00Z');
  private seq = 100;

  constructor(private readonly options: FakeBackendOptions = {}) {
    for (const session of options.sessions ?? []) this.sessions.set(session.session_id, structuredClone(session));
    for (const resume of options.resumes ?? []) this.resumes.set(resume.resume_id, structuredClone(resume));
    this.faults = (options.faults ?? []).map((fault) => ({ ...fault, left: fault.times ?? 1 }));
  }

  /** Same signature as the fetch mock implementation (see `stubFetch`). */
  handle = (url: string, init: RequestInit): Response | Promise<Response> => {
    const method = init.method ?? 'GET';
    const route = `${method} ${url}`;
    this.requests.push(route);
    this.perRoute.set(route, (this.perRoute.get(route) ?? 0) + 1);
    let body: unknown = undefined;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    else if (init.body instanceof FormData) body = { file: (init.body.get('file') as File | null)?.name };
    this.bodies.push({ method, url, body });

    const fault = this.faults.find((f) => f.left > 0 && (typeof f.match === 'string' ? f.match === route : f.match.test(route)));
    if (!fault) return this.route(method, url, body);
    fault.left -= 1;
    const normal = fault.afterEffect || (!fault.response && !fault.networkError) ? this.route(method, url, body) : undefined;
    return Promise.all([this.wait(fault.delayMs), fault.gate]).then(() => {
      if (fault.networkError) throw new TypeError('network down');
      if (fault.response) return fault.response();
      return normal as Response;
    });
  };

  /** Number of requests seen for "METHOD /path". */
  count(route: string): number {
    return this.perRoute.get(route) ?? 0;
  }

  private wait(ms?: number): Promise<void> {
    return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  private now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }

  private route(method: string, url: string, body: unknown): Response {
    if (url === '/api/v1/sessions') {
      if (method === 'POST') return this.createSession((body as { file?: string }).file ?? '合成简历.pdf');
      if (method === 'GET') return this.listSessions();
    }
    if (url === '/api/v1/resumes' && method === 'GET') return this.listResumes();
    const resumeMatch = RESUME_PATH.exec(url);
    if (resumeMatch && method === 'GET') return this.archive(resumeMatch[1] as string, resumeMatch[2] !== undefined);
    const m = SESSION_PATH.exec(url);
    if (!m) return errorResponse(500, { code: 'internal_error' });
    const session = this.sessions.get(m[1] as string);
    if (!session) return errorResponse(404, { code: 'session_not_found' });
    const [, , sub, messageId, action] = m;
    if (messageId && action) return this.suggestionAction(session, messageId, action as 'apply' | 'cancel');
    if (!sub && method === 'GET') return jsonResponse(200, this.detail(session));
    if (!sub && method === 'DELETE') {
      this.sessions.delete(session.session_id);
      return new Response(null, { status: 204 });
    }
    if (sub === '/fields' && method === 'PATCH') return this.patchFields(session, (body as { fields: Record<string, unknown> }).fields);
    if (sub === '/messages' && method === 'POST') return this.sendMessage(session, (body as { content: string }).content);
    if (sub === '/resume' && method === 'POST') return this.saveResume(session, body as { confirmed?: boolean });
    if (sub === '/resume' && method === 'PUT') return this.updateResume(session, body as { confirm_update?: boolean });
    return errorResponse(500, { code: 'internal_error' });
  }

  private touch(session: SessionDetail): void {
    session.last_active_at = this.now();
    session.updated_at = session.last_active_at;
  }

  /** Reading view: old_value comes from the current field value, only for reviewing sessions and pending suggestions. */
  private detail(session: SessionDetail): SessionDetail {
    const copy = structuredClone(session);
    for (const message of copy.messages) {
      for (const suggestion of message.suggestions) {
        const current = copy.fields ? (copy.fields[suggestion.field] as { value: unknown } | undefined)?.value : undefined;
        suggestion.old_value = copy.status === 'reviewing' && suggestion.status === 'pending' ? ((current ?? null) as Suggestion['old_value']) : null;
      }
    }
    return copy;
  }

  private createSession(filename: string): Response {
    const at = this.now();
    const session: SessionDetail = {
      session_id: this.nextId(),
      name: '简历 · 测试用户甲',
      status: 'reviewing',
      update_state: 'none',
      original_file: { filename, content_type: 'application/pdf', size_bytes: 8 },
      fields: sampleFields(),
      resume: null,
      update_candidate: null,
      messages: [],
      created_at: at,
      updated_at: at,
      last_active_at: at,
    };
    this.sessions.set(session.session_id, session);
    return jsonResponse(201, this.detail(session));
  }

  private listSessions(): Response {
    const items = [...this.sessions.values()]
      .sort((a, b) => b.last_active_at.localeCompare(a.last_active_at))
      .map(({ session_id, name, status, last_active_at }) => ({ session_id, name, status, last_active_at }));
    return jsonResponse(200, { items } satisfies SessionListResponse);
  }

  private patchFields(session: SessionDetail, patch: Record<string, unknown>): Response {
    if (session.status !== 'reviewing' || !session.fields) return errorResponse(409, { code: 'session_read_only' });
    session.fields = applyPatch(session.fields, patch);
    this.touch(session);
    return jsonResponse(200, { session_id: session.session_id, fields: session.fields, updated_at: session.updated_at });
  }

  private sendMessage(session: SessionDetail, content: string): Response {
    if (session.status !== 'reviewing') return errorResponse(409, { code: 'session_read_only' });
    const at = this.now();
    const user: ChatMessage = { message_id: this.nextId(), role: 'user', content, suggestions: [], created_at: at };
    const assistant: ChatMessage = {
      message_id: this.nextId(),
      role: 'assistant',
      content: this.options.reply?.(content) ?? '好的，已处理。',
      suggestions: this.options.suggest?.(content) ?? [],
      created_at: at,
    };
    session.messages.push(user, assistant);
    this.touch(session);
    const view = this.detail(session);
    return jsonResponse(201, { user_message: view.messages.at(-2), assistant_message: view.messages.at(-1) });
  }

  private suggestionAction(session: SessionDetail, messageId: string, action: 'apply' | 'cancel'): Response {
    if (session.status !== 'reviewing' || !session.fields) return errorResponse(409, { code: 'session_read_only' });
    const message = session.messages.find((x) => x.message_id === messageId);
    const pending = message?.suggestions.filter((s) => s.applicable && s.status === 'pending') ?? [];
    if (!message || pending.length === 0) return errorResponse(409, { code: 'suggestion_unavailable' });
    for (const suggestion of pending) {
      suggestion.status = action === 'apply' ? 'applied' : 'cancelled';
      if (action === 'apply') session.fields = applyPatch(session.fields, { [suggestion.field]: suggestion.new_value });
    }
    this.touch(session);
    const view = this.detail(session);
    const card = view.messages.find((x) => x.message_id === messageId) as ChatMessage;
    return jsonResponse(200, { message_id: messageId, suggestions: card.suggestions, fields: session.fields, updated_at: session.updated_at });
  }

  private saveResume(session: SessionDetail, body: { confirmed?: boolean }): Response {
    if (body.confirmed !== true) return errorResponse(422, { code: 'confirmation_required' });
    if (session.status !== 'reviewing' || !session.fields) return errorResponse(409, { code: 'session_read_only' });
    const values = fieldsToValues(session.fields);
    const key = (v: ResumeValues) => [v.name, v.phone, v.email].join('|');
    const existing = [...this.resumes.values()].find((r) => key(r.fields) === key(values));
    const file = session.original_file;
    this.saveAnswered = true;
    this.touch(session);
    if (existing) {
      session.status = 'saved';
      session.update_state = 'pending';
      session.update_candidate = { fields: values, original_file: file };
      session.fields = null;
      session.resume = structuredClone(existing);
      return jsonResponse(200, { resume_id: existing.resume_id, already_saved: true, saved_at: existing.saved_at });
    }
    const resume: ArchivedResume = {
      resume_id: this.nextId(),
      fields: values,
      original_file: file,
      file_available: true,
      saved_at: session.updated_at,
      updated_at: session.updated_at,
    };
    this.resumes.set(resume.resume_id, resume);
    session.status = 'saved';
    session.fields = null;
    session.resume = structuredClone(resume);
    return jsonResponse(201, { resume_id: resume.resume_id, already_saved: false, saved_at: resume.saved_at });
  }

  private updateResume(session: SessionDetail, body: { confirm_update?: boolean }): Response {
    if (body.confirm_update !== true) return errorResponse(422, { code: 'confirmation_required' });
    const candidate = session.update_candidate;
    const resume = session.resume && this.resumes.get(session.resume.resume_id);
    if (session.update_state !== 'pending' || !candidate || !resume) return errorResponse(409, { code: 'update_not_available' });
    this.touch(session);
    resume.fields = structuredClone(candidate.fields);
    resume.original_file = structuredClone(candidate.original_file);
    resume.updated_at = session.updated_at;
    session.resume = structuredClone(resume);
    session.update_state = 'applied';
    session.update_candidate = null;
    this.saveAnswered = true;
    return jsonResponse(200, { resume_id: resume.resume_id, updated_at: resume.updated_at });
  }

  private listResumes(): Response {
    const items = [...this.resumes.values()]
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
      .map((r) => ({
        resume_id: r.resume_id,
        name: r.fields.name ?? '',
        phone: r.fields.phone ?? '',
        email: r.fields.email ?? '',
        job_title: r.fields.job_title,
        saved_at: r.saved_at,
      }));
    return jsonResponse(200, { items } satisfies ResumeListResponse);
  }

  private archive(id: string, file: boolean): Response {
    const resume = this.resumes.get(id);
    if (!resume) return errorResponse(404, { code: 'resume_not_found' });
    if (!file) return jsonResponse(200, resume);
    if (!resume.file_available) return errorResponse(404, { code: 'file_not_available' });
    return new Response(new Blob(['%PDF-1.4 synthetic'], { type: 'application/pdf' }), {
      status: 200,
      headers: { 'Content-Type': resume.original_file.content_type },
    });
  }
}

/** A gate for `Fault.gate`: the matching request stays in flight until `open()` is called. */
export function createGate(): { gate: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (open = resolve));
  return { gate, open };
}
