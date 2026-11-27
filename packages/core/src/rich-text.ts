import { z } from 'zod';
import { isSafeUrl } from './urls';

export const RICH_TEXT_LIMITS = {
  characters: 12000,
  nodes: 2000,
  blocks: 200,
  listDepth: 3,
} as const;

export const richTextLinkSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(isSafeUrl, 'Use a /relative, #anchor, https, http, mailto or tel link.');
const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z
    .object({ type: z.literal('link'), attrs: z.object({ href: richTextLinkSchema }).strict() })
    .strict(),
]);
const marks = z
  .array(markSchema)
  .max(4)
  .refine(
    (value) => new Set(value.map((mark) => mark.type)).size === value.length,
    'Each text style may occur only once.',
  )
  .optional();
const inlineSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      text: z.string().min(1).max(RICH_TEXT_LIMITS.characters),
      marks,
    })
    .strict(),
  z.object({ type: z.literal('hardBreak'), marks }).strict(),
]);
const inlineContent = z.array(inlineSchema).max(RICH_TEXT_LIMITS.nodes).optional();
const paragraphSchema = z.object({ type: z.literal('paragraph'), content: inlineContent }).strict();
const headingSchema = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
    content: inlineContent,
  })
  .strict();

export type RichTextMark = z.infer<typeof markSchema>;
export type RichTextInline = z.infer<typeof inlineSchema>;
export type RichTextParagraph = z.infer<typeof paragraphSchema>;
export type RichTextHeading = z.infer<typeof headingSchema>;
export type RichTextListItem = { type: 'listItem'; content: (RichTextParagraph | RichTextList)[] };
export type RichTextList =
  | { type: 'bulletList'; content: RichTextListItem[] }
  | { type: 'orderedList'; attrs: { start: number }; content: RichTextListItem[] };
export type RichTextNode = RichTextParagraph | RichTextHeading | RichTextList;

function listSchema(depth: number): z.ZodType<RichTextList> {
  const child = depth > 1 ? z.union([paragraphSchema, listSchema(depth - 1)]) : paragraphSchema;
  const item = z
    .object({
      type: z.literal('listItem'),
      content: z
        .array(child)
        .min(1)
        .max(100)
        .refine(
          (value) => value[0]?.type === 'paragraph',
          'List items must begin with a paragraph.',
        ),
    })
    .strict();
  const content = z.array(item).min(1).max(100);
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('bulletList'), content }).strict(),
    z
      .object({
        type: z.literal('orderedList'),
        attrs: z.object({ start: z.number().int().min(1).max(100000) }).strict(),
        content,
      })
      .strict(),
  ]);
}

// Bound work before parsing the finite-depth schema, including hostile deeply nested input.
const boundedTree = z.unknown().superRefine((value, ctx) => {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0,
    characters = 0;
  while (pending.length) {
    const { value: node, depth } = pending.pop()!;
    if (++nodes > RICH_TEXT_LIMITS.nodes || depth > 8) {
      ctx.addIssue({ code: 'custom', message: 'Text has too many elements or nested lists.' });
      return;
    }
    if (!node || typeof node !== 'object') continue;
    const item = node as Record<string, unknown>;
    characters +=
      typeof item.text === 'string' ? item.text.length : item.type === 'hardBreak' ? 1 : 0;
    if (characters > RICH_TEXT_LIMITS.characters) {
      ctx.addIssue({
        code: 'custom',
        message: 'A text section can contain at most 12,000 characters.',
      });
      return;
    }
    if (Array.isArray(item.content)) {
      if (item.content.length > RICH_TEXT_LIMITS.nodes) {
        ctx.addIssue({ code: 'custom', message: 'Text has too many elements.' });
        return;
      }
      for (const child of item.content) pending.push({ value: child, depth: depth + 1 });
    }
  }
});
export const richTextSchema = boundedTree.pipe(
  z
    .object({
      version: z.literal(1),
      type: z.literal('doc'),
      content: z
        .array(z.union([paragraphSchema, headingSchema, listSchema(RICH_TEXT_LIMITS.listDepth)]))
        .min(1)
        .max(RICH_TEXT_LIMITS.blocks),
    })
    .strict(),
);
export type RichText = z.infer<typeof richTextSchema>;

export function richTextFromPlainText(text: string): RichText {
  const paragraph = (value: string): RichTextParagraph => ({
    type: 'paragraph',
    ...(value ? { content: [{ type: 'text', text: value }] } : {}),
  });
  const parts = text.split(/\n\s*\n/);
  // Unusual legacy whitespace must remain editable without exceeding the new node limit.
  return {
    version: 1,
    type: 'doc',
    content:
      parts.length <= RICH_TEXT_LIMITS.blocks && parts.join('\n\n') === text
        ? parts.map(paragraph)
        : [paragraph(text)],
  };
}

export function richTextToPlainText(value: RichText): string {
  function text(node: RichTextNode | RichTextListItem | RichTextInline): string {
    if (node.type === 'text') return node.text;
    if (node.type === 'hardBreak') return '\n';
    return (node.content || [])
      .map(text)
      .join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n');
  }
  return value.content.map(text).join('\n\n');
}

export function richTextCharacterCount(value: RichText): number {
  function count(node: RichTextNode | RichTextListItem | RichTextInline): number {
    if (node.type === 'text') return node.text.length;
    if (node.type === 'hardBreak') return 1;
    return (node.content || []).reduce((total, child) => total + count(child), 0);
  }
  return value.content.reduce((total, node) => total + count(node), 0);
}
