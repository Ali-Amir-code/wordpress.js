import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  contentPath,
  draftSchema,
  emptyDocument,
  kindSchema,
  settingsSchema,
  starterDocument,
} from '@wordpressjs/core';
import { AppError, Repository } from './repository';
import { equalToken, hashPassword, newToken, tokenHash, verifyPassword } from './auth';
import { escapeXml, renderBlog, renderDocument, renderNotice } from './render';

export interface AppOptions {
  databasePath: string;
  setupToken: string;
  siteUrl: string;
  adminOrigin: string;
  staticDir?: string;
  stylesheetPath: string;
  logger?: boolean;
  rateLimit?: boolean;
}
const revisionSchema = z.object({ revision: z.number().int().positive() }).strict();
const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const publicApi = new Set(['/api/health', '/api/setup/status', '/api/setup', '/api/auth/login']);
const sessionLifetime = 7 * 24 * 60 * 60;
export async function buildApp(options: AppOptions) {
  const repo = new Repository(options.databasePath);
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'] }
      : false,
    bodyLimit: 512 * 1024,
    trustProxy: false,
  });
  app.addHook('onClose', async () => repo.close());
  const secure = options.siteUrl.startsWith('https:');
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure,
    maxAge: sessionLifetime,
  };
  const dummyHash = await hashPassword(newToken());
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https:', 'http:', 'data:'],
        frameSrc: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: secure ? [] : null,
      },
    },
    xFrameOptions: { action: 'sameorigin' },
    strictTransportSecurity: secure,
  });
  await app.register(rateLimit, { global: false, max: 8, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (request.headers.origin !== options.adminOrigin)
        throw new AppError(403, 'This request must come from the configured admin origin.');
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json'))
        throw new AppError(415, 'Send an application/json request.');
    }
    if (!publicApi.has(path)) {
      const token = request.cookies.wjs_session;
      if (!token || !repo.session(tokenHash(token)))
        throw new AppError(401, 'Please sign in to continue.');
    }
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: 'Check the highlighted content fields.',
        details: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
    if (error.message.includes('UNIQUE constraint failed'))
      return reply.code(409).send({
        error:
          'That address is already used by another draft or published item. Choose a different slug.',
      });
    const status = error instanceof AppError ? error.statusCode : error.statusCode || 500;
    if (status >= 500) request.log.error(error);
    return reply
      .code(status)
      .send({ error: status >= 500 ? 'Something went wrong. Please try again.' : error.message });
  });
  const startSession = (reply: import('fastify').FastifyReply) => {
    const token = newToken();
    repo.addSession(tokenHash(token), Date.now() + sessionLifetime * 1000);
    reply.setCookie('wjs_session', token, cookieOptions);
  };
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/setup/status', async () => ({ needsSetup: !repo.owner() }));
  app.post(
    '/api/setup',
    {
      config: {
        rateLimit: options.rateLimit === false ? false : { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      if (repo.owner()) throw new AppError(409, 'This site has already been set up.');
      const data = credentials
        .extend({
          name: z.string().trim().min(1).max(100),
          siteTitle: z.string().trim().min(1).max(100),
          token: z.string().min(32).max(256),
        })
        .parse(request.body);
      if (!equalToken(data.token, options.setupToken))
        throw new AppError(
          403,
          'The installation key is incorrect. Check your server’s setup-token.txt file.',
        );
      const hash = await hashPassword(data.password);
      repo.setup(data.name, data.email, hash, data.siteTitle, {
        title: 'Home',
        slug: 'home',
        description: 'A warm welcome to our little corner of the internet.',
        document: starterDocument(),
      });
      startSession(reply);
      return reply.code(201).send({ user: { id: 1, name: data.name, email: data.email } });
    },
  );
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: options.rateLimit === false ? false : { max: 8, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const data = credentials.parse(request.body),
        owner = repo.owner();
      const valid = await verifyPassword(data.password, owner?.password_hash || dummyHash);
      if (!valid || !owner || owner.email !== data.email)
        throw new AppError(401, 'The email or password is incorrect.');
      startSession(reply);
      return { user: { id: owner.id, name: owner.name, email: owner.email } };
    },
  );
  app.get('/api/auth/me', async (request) => ({
    user: repo.session(tokenHash(request.cookies.wjs_session!)),
  }));
  app.post('/api/auth/logout', async (request, reply) => {
    repo.deleteSession(tokenHash(request.cookies.wjs_session!));
    reply.clearCookie('wjs_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/overview', async () => ({
    stats: repo.stats(),
    ...repo.settings(),
    siteUrl: options.siteUrl,
  }));
  app.get('/api/settings', async () => repo.settings());
  app.put('/api/settings', async (request) => {
    const data = z
      .object({ settings: settingsSchema, revision: z.number().int().positive() })
      .strict()
      .parse(request.body);
    return repo.updateSettings(data.settings, data.revision);
  });
  app.get('/api/content', async (request) =>
    repo.list(
      z
        .object({
          kind: kindSchema.optional(),
          q: z.string().max(100).default(''),
          status: z.enum(['draft', 'published']).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse(request.query),
    ),
  );
  app.post('/api/content', async (request, reply) => {
    const data = z
      .object({
        kind: kindSchema,
        title: z.string().trim().min(1).max(160),
        slug: draftSchema.shape.slug,
        template: z.enum(['blank', 'starter']).default('blank'),
      })
      .strict()
      .parse(request.body);
    return reply.code(201).send(
      repo.create(data.kind, {
        title: data.title,
        slug: data.slug,
        description: '',
        document: data.template === 'starter' ? starterDocument() : emptyDocument(),
      }),
    );
  });
  const contentId = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.get('/api/content/:id', async (request) => repo.get(contentId(request.params)));
  app.put('/api/content/:id', async (request) => {
    const data = draftSchema.extend({ revision: z.number().int().positive() }).parse(request.body);
    const { revision, ...draft } = data;
    return repo.save(contentId(request.params), draft, revision);
  });
  app.post('/api/content/:id/publish', async (request) =>
    repo.publish(contentId(request.params), revisionSchema.parse(request.body).revision, true),
  );
  app.post('/api/content/:id/unpublish', async (request) =>
    repo.publish(contentId(request.params), revisionSchema.parse(request.body).revision, false),
  );
  app.get('/api/content/:id/preview', async (request, reply) => {
    const data = repo.get(contentId(request.params));
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return reply
      .type('text/html')
      .send(renderDocument(repo, options.siteUrl, data, data.kind, true));
  });
  app.get('/site.css', async (_request, reply) =>
    reply.type('text/css').send(await readFile(options.stylesheetPath, 'utf8')),
  );
  app.get('/placeholder.svg', async (_request, reply) =>
    reply
      .type('image/svg+xml')
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640"><rect width="1200" height="640" fill="#edf1e9"/><circle cx="850" cy="190" r="90" fill="#d6ddc6"/><path d="M0 530 320 240 640 540 880 350 1200 600V640H0Z" fill="#718d71"/><path d="m0 640 430-210 350 160 420-100v150" fill="#244d3c"/></svg>',
      ),
  );
  app.get('/robots.txt', async (_request, reply) =>
    reply
      .type('text/plain')
      .send(
        `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${options.siteUrl}/sitemap.xml\n`,
      ),
  );
  app.get('/sitemap.xml', async (_request, reply) => {
    const urls = repo
      .publicContent()
      .map(
        (item) =>
          `<url><loc>${escapeXml(options.siteUrl + contentPath(item.kind, item.slug))}</loc><lastmod>${item.publishedAt}</lastmod></url>`,
      )
      .join('');
    return reply
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeXml(options.siteUrl)}/blog</loc></url>${urls}</urlset>`,
      );
  });
  app.get('/blog', async (_request, reply) =>
    reply.type('text/html').send(renderBlog(repo, options.siteUrl)),
  );
  const notFound = (reply: import('fastify').FastifyReply) =>
    reply
      .code(404)
      .type('text/html')
      .send(
        renderNotice(
          repo,
          options.siteUrl,
          'This page isn’t here.',
          'It may have moved, or it hasn’t been published yet.',
        ),
      );
  app.get('/', async (_request, reply) => {
    const page = repo.findPublished('page', 'home');
    return reply
      .type('text/html')
      .send(
        page
          ? renderDocument(repo, options.siteUrl, page, 'page')
          : renderNotice(
              repo,
              options.siteUrl,
              'Something good is on its way.',
              'This site is taking shape. Come back soon.',
            ),
      );
  });
  app.get('/blog/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const page = repo.findPublished('post', slug);
    return page
      ? reply.type('text/html').send(renderDocument(repo, options.siteUrl, page, 'post'))
      : notFound(reply);
  });
  if (options.staticDir) {
    await app.register(staticFiles, {
      root: resolve(options.staticDir),
      prefix: '/admin/',
      index: 'index.html',
    });
    app.get('/admin', async (_request, reply) => reply.redirect('/admin/'));
  }
  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const page = repo.findPublished('page', slug);
    return page
      ? reply.type('text/html').send(renderDocument(repo, options.siteUrl, page, 'page'))
      : notFound(reply);
  });
  app.setNotFoundHandler(async (request, reply) =>
    request.url.startsWith('/api/')
      ? reply.code(404).send({ error: 'Endpoint not found.' })
      : notFound(reply),
  );
  return app;
}
