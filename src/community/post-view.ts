import type { Comment } from '../database/schema/entities/service/comment.entity.js';
import type { PostAttachment } from '../database/schema/entities/service/post-attachment.entity.js';
import type { Post } from '../database/schema/entities/service/post.entity.js';
import { CATEGORY_LABELS, PERIOD_LABELS, type CommentResponse, type PostResponse } from './community.schemas.js';

/** 프로필이 없을 때(이론상 없음) 보이는 이름 */
export const UNKNOWN_AUTHOR = '알 수 없는 사용자';

export function toCommentResponse(c: Comment, author: string, viewerId: number): CommentResponse {
  return { id: String(c.id), author, at: c.createdAt.toISOString(), text: c.content, mine: c.userId === viewerId };
}

export interface PostParts {
  author: string;
  attachment: PostAttachment | undefined;
  liked: boolean;
  comments: CommentResponse[];
}

export function toPostResponse(p: Post, parts: PostParts, viewerId: number): PostResponse {
  const a = parts.attachment;
  return {
    id: String(p.id),
    category: CATEGORY_LABELS[p.category],
    crop: p.crop ?? '공통',
    author: parts.author,
    at: p.createdAt.toISOString(),
    mine: p.userId === viewerId,
    title: p.title,
    body: p.body,
    attach: a ? { label: a.label, period: PERIOD_LABELS[a.period], points: a.points, lower: a.lowerThreshold, upper: a.upperThreshold } : null,
    photo: p.photoUrl,
    likes: p.likeCount,
    liked: parts.liked,
    comments: parts.comments,
  };
}

/** LIKE 검색어의 %, _, \ 를 글자 그대로 찾도록 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
