import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MEDIA_LIMITS, mediaMetadataSchema } from '@wordpressjs/core';
import { AppError, type Repository } from './repository';
import { tokenHash } from './auth';
import type { MediaStorage } from './media-storage';

function inputFormat(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  throw new AppError(
    415,
    'Upload a JPEG, PNG or WebP image. SVG and other formats are not supported.',
  );
}
export async function normalizeImage(bytes: Buffer, filename: string, mimetype: string) {
  if (!bytes.length || bytes.length > MEDIA_LIMITS.uploadBytes)
    throw new AppError(413, 'Images must be nonempty and no larger than 10 MiB.');
  const format = inputFormat(bytes);
  const extensions = { jpeg: /\.jpe?g$/i, png: /\.png$/i, webp: /\.webp$/i };
  if (mimetype !== `image/${format}` || !extensions[format].test(filename))
    throw new AppError(415, 'The filename, image type and file contents do not match.');
  const decoder = sharp(bytes, {
    limitInputPixels: MEDIA_LIMITS.pixels,
    failOn: 'warning',
    animated: false,
  });
  try {
    const metadata = await decoder.metadata();
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MEDIA_LIMITS.inputDimension ||
      metadata.height > MEDIA_LIMITS.inputDimension ||
      (metadata.pages || 1) > 1
    )
      throw new AppError(
        400,
        'Use a still image no larger than 8192 pixels per side and 24 megapixels.',
      );
    return await decoder
      .rotate()
      .resize({
        width: MEDIA_LIMITS.outputDimension,
        height: MEDIA_LIMITS.outputDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      'This image could not be safely decoded. Use a complete JPEG, PNG or WebP under 24 megapixels.',
    );
  } finally {
    decoder.destroy();
  }
}

export async function recoverMedia(repo: Repository, storage: MediaStorage) {
  for (const { id } of repo.media.incomplete()) {
    await storage.remove(id);
    repo.media.finishRemoval(id);
  }
}
export async function registerMedia(
  app: FastifyInstance,
  repo: Repository,
  storage: MediaStorage,
  rateLimited = true,
) {
  await recoverMedia(repo, storage);
  await app.register(multipart, {
    limits: { fileSize: MEDIA_LIMITS.uploadBytes, files: 1, fields: 0, parts: 1, headerPairs: 100 },
  });
  const parseId = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  let inFlight = 0;
  app.post(
    '/api/media',
    {
      config: { rateLimit: rateLimited ? { max: 12, timeWindow: '1 minute' } : false },
      bodyLimit: MEDIA_LIMITS.uploadBytes + 64 * 1024,
    },
    async (request, reply) => {
      if (inFlight >= MEDIA_LIMITS.concurrentUploads)
        throw new AppError(429, 'Other images are being processed. Please try again in a moment.');
      inFlight++;
      try {
        let upload: { bytes: Buffer; filename: string; mimetype: string } | undefined;
        for await (const part of request.parts()) {
          if (part.type !== 'file' || part.fieldname !== 'file')
            throw new AppError(400, 'Send one image in the file field.');
          const bytes = await part.toBuffer();
          if (part.file.truncated) throw new AppError(413, 'Images must be no larger than 10 MiB.');
          upload = { bytes, filename: part.filename, mimetype: part.mimetype };
        }
        if (!upload) throw new AppError(400, 'Choose one image to upload.');
        const { data, info } = await normalizeImage(upload.bytes, upload.filename, upload.mimetype);
        const id = randomUUID();
        const title =
          upload.filename
            .replace(/.*[/\\]/, '')
            .replace(/\.[^.]*$/, '')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, 160) || 'Untitled image';
        repo.media.reserve(id, { title, alt: '', caption: '' }, info.width, info.height, info.size);
        try {
          await storage.write(id, data);
          return reply.code(201).send(repo.media.activate(id));
        } catch (error) {
          try {
            await storage.remove(id);
            repo.media.finishRemoval(id);
          } catch (cleanupError) {
            request.log.error(cleanupError, 'Media cleanup will be retried at next startup');
          }
          throw error;
        }
      } finally {
        inFlight--;
      }
    },
  );
  app.get('/api/media', async (request) => {
    const query = z
      .object({
        q: z.string().max(100).default(''),
        limit: z.coerce.number().int().min(1).max(100).default(24),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    return repo.media.list(query.q, query.limit, query.offset);
  });
  app.get('/api/media/:id', async (request) => repo.media.get(parseId(request.params)));
  app.put('/api/media/:id', async (request) => {
    const { revision, ...metadata } = mediaMetadataSchema
      .extend({ revision: z.number().int().positive() })
      .parse(request.body);
    return repo.media.update(parseId(request.params), metadata, revision);
  });
  app.delete('/api/media/:id', async (request) => {
    const id = parseId(request.params);
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(request.body);
    repo.media.beginDeletion(id, revision);
    await storage.remove(id);
    repo.media.finishRemoval(id);
    return { ok: true };
  });
  app.get('/media/:id.webp', async (request, reply) => {
    reply
      .header('Cache-Control', 'private, no-store')
      .header('Vary', 'Cookie')
      .header('X-Robots-Tag', 'noindex')
      .header('Content-Disposition', 'inline');
    const id = parseId(request.params);
    repo.media.get(id);
    const token = request.cookies.wjs_session;
    if (!repo.media.isPublished(id) && !(token && repo.session(tokenHash(token))))
      throw new AppError(404, 'Image not found.');
    try {
      return reply.type('image/webp').send(await storage.read(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new AppError(404, 'Image file is missing.');
      throw error;
    }
  });
}
