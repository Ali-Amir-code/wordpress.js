import { z } from 'zod';
import { isSafeUrl } from './urls';
import type { ContentEntry, ContentKind } from './index';

const baseItem = { id: z.uuid(), label: z.string().trim().min(1).max(80) };
export const navigationItemSchema = z.discriminatedUnion('type', [
  z.object({ ...baseItem, type: z.literal('content'), contentId: z.uuid() }).strict(),
  z
    .object({
      ...baseItem,
      type: z.literal('url'),
      url: z
        .string()
        .max(2048)
        .refine((url) => isSafeUrl(url), 'Use a relative, http, https, mailto or tel link.'),
    })
    .strict(),
]);
export const navigationSchema = z
  .object({
    homepageId: z.uuid().nullable(),
    header: z
      .object({ mode: z.enum(['auto', 'custom']), items: z.array(navigationItemSchema).max(20) })
      .strict(),
    footer: z
      .object({ text: z.string().max(300), items: z.array(navigationItemSchema).max(20) })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const section of ['header', 'footer'] as const)
      value[section].items.forEach((item, index) => {
        if (ids.has(item.id))
          ctx.addIssue({
            code: 'custom',
            message: 'Menu item IDs must be unique.',
            path: [section, 'items', index, 'id'],
          });
        ids.add(item.id);
      });
  });
export type NavigationItem = z.infer<typeof navigationItemSchema>;
export type NavigationDocument = z.infer<typeof navigationSchema>;
export const defaultNavigation = (): NavigationDocument => ({
  homepageId: null,
  header: { mode: 'auto', items: [] },
  footer: { text: 'Made with WordPressJS', items: [] },
});
export type NavigationTarget = {
  id: string;
  kind: ContentKind;
  title: string;
  published: boolean;
  path: string | null;
};
export type NavigationState = {
  draft: NavigationDocument;
  published: NavigationDocument;
  revision: number;
  publishedAt: string | null;
  references: NavigationTarget[];
};
export type ContentView = ContentEntry & { publicPath: string | null; homepageId: string | null };
export type ResolvedLink = { id: string; label: string; href: string };
