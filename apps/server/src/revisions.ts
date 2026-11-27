import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { slugSchema } from '@wordpressjs/core';
import type { Repository } from './repository';
import { renderDocument } from './render';

export function registerRevisions(app: FastifyInstance, repo: Repository, siteUrl: string) {
  const params = z.object({
    id: z.uuid(),
    historyId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  });
  app.get('/api/content/:id/revisions', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { limit, offset } = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .strict()
      .parse(request.query);
    return repo.revisions.list(id, limit, offset);
  });
  app.get('/api/content/:id/revisions/:historyId', async (request) => {
    const { id, historyId } = params.parse(request.params);
    return repo.revisions.get(id, historyId);
  });
  app.get('/api/content/:id/revisions/:historyId/preview', async (request, reply) => {
    const { id, historyId } = params.parse(request.params);
    const version = repo.revisions.get(id, historyId);
    const snapshot = repo.media.validateDraft(version.snapshot);
    const current = repo.get(id);
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return reply
      .type('text/html')
      .send(renderDocument(repo, siteUrl, { ...snapshot, id }, current.kind, true));
  });
  app.post('/api/content/:id/revisions/:historyId/restore', async (request) => {
    const { id, historyId } = params.parse(request.params);
    const { revision, slug } = z
      .object({ revision: z.number().int().positive(), slug: slugSchema.optional() })
      .strict()
      .parse(request.body);
    return repo.navigation.present(repo.restore(id, historyId, revision, slug));
  });
}
