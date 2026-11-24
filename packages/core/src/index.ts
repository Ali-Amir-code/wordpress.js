import { z } from 'zod';
import { mediaSelectionSchema } from './media';
export * from './media';

const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(160);
const tone = z.enum(['light', 'tint', 'dark']);
export function isSafeUrl(value: string, image = false): boolean {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  if (!image && value.startsWith('#')) return true;
  try {
    const url = new URL(value);
    return (image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:', 'tel:']).includes(
      url.protocol,
    );
  } catch {
    return false;
  }
}
const href = text(2048).refine(
  (v) => isSafeUrl(v),
  'Use a relative link or an http, https, mailto or tel URL.',
);
const imageUrl = text(2048).refine(
  (v) => isSafeUrl(v, true),
  'Use an http, https or relative image URL.',
);

export const blockSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('MediaImage'),
      props: z.object({ id, asset: mediaSelectionSchema.nullable() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Hero'),
      props: z
        .object({
          id,
          eyebrow: text(100),
          title: text(200),
          text: text(2000),
          buttonLabel: text(80),
          buttonHref: href,
          tone,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Text'),
      props: z.object({ id, heading: text(200), text: text(12000) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Features'),
      props: z
        .object({
          id,
          heading: text(200),
          items: z.array(z.object({ title: text(150), text: text(1000) }).strict()).max(12),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Image'),
      props: z.object({ id, src: imageUrl, alt: text(500), caption: text(500) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('CallToAction'),
      props: z
        .object({ id, title: text(200), text: text(2000), buttonLabel: text(80), buttonHref: href })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Quote'),
      props: z.object({ id, quote: text(2000), author: text(200) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Spacer'),
      props: z.object({ id, size: z.enum(['small', 'medium', 'large']) }).strict(),
    })
    .strict(),
]);

export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    content: z.array(blockSchema).max(100),
    root: z.object({ props: z.object({}).strict() }).strict(),
  })
  .strict()
  .refine(
    (doc) => new Set(doc.content.map((block) => block.props.id)).size === doc.content.length,
    'Block IDs must be unique.',
  );
export type Block = z.infer<typeof blockSchema>;
export type ContentDocument = z.infer<typeof documentSchema>;
export type BlockProps = { [K in Block['type']]: Omit<Extract<Block, { type: K }>['props'], 'id'> };

export const kindSchema = z.enum(['page', 'post']);
export type ContentKind = z.infer<typeof kindSchema>;
const reservedSlugs = new Set(['admin', 'api', 'blog', 'assets', 'site-css', 'sitemap', 'robots']);
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.')
  .refine((slug) => !reservedSlugs.has(slug), 'This address is reserved.');
export const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    slug: slugSchema,
    description: text(320),
    document: documentSchema,
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export type ContentEntry = Draft & {
  id: string;
  kind: ContentKind;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  published: Draft | null;
};
export const settingsSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: text(320),
    accent: z.enum(['forest', 'ocean', 'violet']),
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/),
  })
  .strict();
export type SiteSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: SiteSettings = {
  title: 'Your next chapter',
  description: 'A little corner of the internet, made yours.',
  accent: 'forest',
  language: 'en',
};
export const emptyDocument = (): ContentDocument => ({
  schemaVersion: 1,
  content: [],
  root: { props: {} },
});
export function starterDocument(): ContentDocument {
  return {
    schemaVersion: 1,
    root: { props: {} },
    content: [
      {
        type: 'Hero',
        props: {
          id: 'hero-welcome',
          eyebrow: 'SMALL BEGINNINGS. BIG POSSIBILITIES.',
          title: 'Good things start with a little space to grow.',
          text: 'Welcome to our corner of the internet. A place for ideas, meaningful work, and whatever comes next.',
          buttonLabel: 'Discover our story',
          buttonHref: '#our-story',
          tone: 'tint',
        },
      },
      {
        type: 'Features',
        props: {
          id: 'features-welcome',
          heading: 'Made with a little more care.',
          items: [
            {
              title: 'Thoughtfully made',
              text: 'We believe the details make the difference. Every project starts with listening.',
            },
            {
              title: 'Built around people',
              text: 'Real conversations. Lasting relationships. Work that makes everyday life a little better.',
            },
            {
              title: 'Always growing',
              text: 'New ideas and fresh perspectives. There is always something good on the horizon.',
            },
          ],
        },
      },
      {
        type: 'Text',
        props: {
          id: 'our-story',
          heading: 'A small introduction.',
          text: 'Every great story starts somewhere. This is ours.\n\nUse this space to share what you do, what you care about, and what makes your business yours. You can change any of these blocks in the visual editor.',
        },
      },
      {
        type: 'CallToAction',
        props: {
          id: 'cta-welcome',
          title: 'Let’s make something good.',
          text: 'We would love to hear what you have in mind.',
          buttonLabel: 'Say hello',
          buttonHref: 'mailto:hello@example.com',
        },
      },
    ],
  };
}
export function contentPath(kind: ContentKind, slug: string): string {
  return kind === 'post' ? `/blog/${slug}` : slug === 'home' ? '/' : `/${slug}`;
}
