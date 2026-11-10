import type { DraftResponse } from '../types/Draft';
import { applyPatch, errorResponse, jsonResponse, sampleCreateResumeResponse, sampleDraft } from './ApiMocks';

export interface FakeBackendOptions {
  /** Draft already on the server when the page opens (null = none). */
  draft?: DraftResponse | null;
  /** Called for every request before the normal behaviour; return a Response (or promise) to take over. */
  intercept?: (url: string, init: RequestInit, count: number) => Response | Promise<Response> | undefined;
  /** Response of POST /resumes; default is a fresh save (201, already_saved=false). */
  confirm?: () => Response | Promise<Response>;
}

/**
 * A small in-memory backend following the contract's behaviour: one draft per browser, PATCH confirms the submitted
 * fields, a successful save deletes the draft (so a second confirm answers 404, C-11). Synthetic data only.
 */
export class FakeBackend {
  draft: DraftResponse | null;
  readonly requests: string[] = [];
  readonly bodies: { method: string; url: string; body: unknown }[] = [];
  /** Set to true right before the save response is handed back; "已保存" must never appear before this. */
  saveAnswered = false;
  private perRoute = new Map<string, number>();

  constructor(private readonly options: FakeBackendOptions = {}) {
    this.draft = options.draft === undefined ? null : options.draft;
  }

  handle = (url: string, init: RequestInit): Response | Promise<Response> => {
    const method = init.method ?? 'GET';
    const route = `${method} ${url}`;
    this.requests.push(route);
    const count = (this.perRoute.get(route) ?? 0) + 1;
    this.perRoute.set(route, count);
    let body: unknown = undefined;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    else if (init.body instanceof FormData) body = { file: (init.body.get('file') as File | null)?.name };
    this.bodies.push({ method, url, body });

    const taken = this.options.intercept?.(url, init, count);
    if (taken) return taken;

    if (url === '/api/v1/resume-drafts/current' && method === 'GET') {
      return this.draft ? jsonResponse(200, this.draft) : errorResponse(404, { code: 'draft_not_found' });
    }
    if (url === '/api/v1/resume-drafts' && method === 'POST') {
      const name = (body as { file?: string }).file ?? '合成简历.pdf';
      this.draft = sampleDraft({ original_file: { filename: name, content_type: 'application/pdf', size_bytes: 8 } });
      return jsonResponse(201, this.draft);
    }
    if (url === '/api/v1/resume-drafts/current' && method === 'PATCH') {
      if (!this.draft) return errorResponse(404, { code: 'draft_not_found' });
      this.draft = applyPatch(this.draft, (body as { fields: Record<string, unknown> }).fields);
      return jsonResponse(200, this.draft);
    }
    if (url === '/api/v1/resumes' && method === 'POST') {
      if (this.options.confirm) return this.wrapConfirm(this.options.confirm());
      if (!this.draft) return errorResponse(404, { code: 'draft_not_found' });
      this.draft = null;
      this.saveAnswered = true;
      return jsonResponse(201, sampleCreateResumeResponse());
    }
    return errorResponse(500, { code: 'internal_error' });
  };

  private wrapConfirm(result: Response | Promise<Response>): Response | Promise<Response> {
    return Promise.resolve(result).then((response) => {
      this.saveAnswered = true;
      return response;
    });
  }

  count(route: string): number {
    return this.perRoute.get(route) ?? 0;
  }
}
