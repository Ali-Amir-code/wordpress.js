import { z } from 'zod';

export const MEDIA_LIMITS = {
  uploadBytes: 10 * 1024 * 1024,
  pixels: 24_000_000,
  inputDimension: 8192,
  outputDimension: 2560,
  libraryBytes: 256 * 1024 * 1024,
  libraryItems: 1000,
  concurrentUploads: 2,
} as const;
export const mediaMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    alt: z.string().max(500),
    caption: z.string().max(500),
  })
  .strict();
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export const mediaSelectionSchema = z
  .object({
    id: z.uuid(),
    width: z.number().int().min(1).max(MEDIA_LIMITS.outputDimension),
    height: z.number().int().min(1).max(MEDIA_LIMITS.outputDimension),
    alt: z.string().max(500),
    caption: z.string().max(500),
  })
  .strict();
export type MediaSelection = z.infer<typeof mediaSelectionSchema>;
export type MediaItem = MediaMetadata & {
  id: string;
  width: number;
  height: number;
  bytes: number;
  revision: number;
  createdAt: string;
  url: string;
  draftUses: number;
  publishedUses: number;
};
export type MediaList = {
  items: MediaItem[];
  total: number;
  usage: { bytes: number; items: number; maxBytes: number; maxItems: number };
};
export const mediaPath = (id: string) => `/media/${id}.webp`;
export const mediaSelection = (item: MediaItem): MediaSelection => ({
  id: item.id,
  width: item.width,
  height: item.height,
  alt: item.alt,
  caption: item.caption,
});
