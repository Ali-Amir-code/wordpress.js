import type { Draft } from './index';

export const REVISION_LIMIT = 30;
export type RevisionEvent =
  | 'created'
  | 'saved'
  | 'published'
  | 'restored'
  | 'unpublished'
  | 'upgrade-draft'
  | 'upgrade-publication'
  | 'archived-publication';
export type RevisionSummary = {
  id: number;
  contentId: string;
  revision: number;
  event: RevisionEvent;
  createdAt: string;
  title: string;
  slug: string;
  description: string;
  blockCount: number;
  isCurrentPublication: boolean;
  restoredFrom: number | null;
};
export type ContentRevision = RevisionSummary & { snapshot: Draft };
export type RevisionList = { items: RevisionSummary[]; total: number; retainedLimit: number };
