import { z } from 'zod';
import type { ChartPeriod, PostCategory } from '../database/schema/enums.js';

/** DB 코드값 ↔ 화면 문구 */
export const CATEGORY_LABELS = { QUESTION: '질문', RECORD: '기록 공유', TIP: '팁' } as const satisfies Record<PostCategory, string>;
export const PERIOD_LABELS = { '24H': '24시간', '7D': '7일' } as const satisfies Record<ChartPeriod, string>;
const CATEGORY_NAMES = ['질문', '기록 공유', '팁'] as const;
const PERIOD_NAMES = ['24시간', '7일'] as const;

export function categoryCode(label: (typeof CATEGORY_NAMES)[number]): PostCategory {
  return (Object.keys(CATEGORY_LABELS) as PostCategory[]).find((k) => CATEGORY_LABELS[k] === label)!;
}
export function periodCode(label: (typeof PERIOD_NAMES)[number]): ChartPeriod {
  return label === '7일' ? '7D' : '24H';
}

/** 한 번에 불러오는 글 수 (회의록 IA 9번: 20개씩) */
export const POST_PAGE_SIZE = 20;

export const commentResponseSchema = z
  .object({
    id: z.string().meta({ example: '31' }),
    author: z.string().meta({ example: '허브정원' }),
    at: z.iso.datetime(),
    text: z.string(),
    mine: z.boolean().meta({ description: '내가 쓴 댓글인지 (삭제 버튼 표시)' }),
  })
  .meta({ id: 'Comment' });
export type CommentResponse = z.infer<typeof commentResponseSchema>;

export const chartSnapshotSchema = z
  .object({
    label: z.string().meta({ example: '베란다 바질 · 최근 24시간' }),
    period: z.enum(PERIOD_NAMES),
    points: z.array(z.number()).meta({ description: '글을 올린 시점의 그래프 값(오래된 값부터). 값이 없던 구간은 빠짐' }),
    lower: z.number().meta({ example: 35 }),
    upper: z.number().meta({ example: 80 }),
  })
  .meta({ id: 'ChartSnapshot' });
export type ChartSnapshot = z.infer<typeof chartSnapshotSchema>;

export const postResponseSchema = z
  .object({
    id: z.string().meta({ example: '12' }),
    category: z.enum(CATEGORY_NAMES),
    crop: z.string().meta({ description: "작물. 비어 있으면 '공통'", example: '바질' }),
    author: z.string().meta({ example: '바질집사' }),
    at: z.iso.datetime().meta({ description: '올린 시각' }),
    mine: z.boolean().meta({ description: '내가 쓴 글인지 (삭제 버튼 표시)' }),
    title: z.string(),
    body: z.string().meta({ description: '줄바꿈은 \\n' }),
    attach: chartSnapshotSchema.nullable().meta({ description: '글을 올린 시점에 고정한 그래프. 없으면 null' }),
    photo: z.string().nullable().meta({ description: '사진 주소 (같은 서버의 /api/uploads/...)', example: '/api/uploads/posts/3f2a.jpg' }),
    likes: z.number().int().meta({ example: 12 }),
    liked: z.boolean().meta({ description: '내가 공감했는지' }),
    comments: z.array(commentResponseSchema).meta({ description: '댓글(오래된 순)' }),
  })
  .meta({ id: 'Post' });
export type PostResponse = z.infer<typeof postResponseSchema>;

export const likeResultSchema = z.object({ liked: z.boolean(), likes: z.number().int() }).meta({ id: 'LikeResult' });
export type LikeResult = z.infer<typeof likeResultSchema>;

/** GET /community/posts 쿼리 */
export const listPostsQuerySchema = z.object({
  category: z.enum(CATEGORY_NAMES, { error: "category는 '질문', '기록 공유', '팁' 중 하나입니다." }).optional(),
  q: z.string().trim().max(50, { error: '검색어는 50자 이하입니다.' }).optional().meta({ description: '제목·본문·작물·작성자에서 검색' }),
  mine: z.stringbool({ error: 'mine은 true/false입니다.' }).optional().meta({ description: 'true면 내가 쓴 글만 (계정 화면의 내 활동)' }),
  cursor: z.coerce
    .number({ error: 'cursor는 숫자여야 합니다.' })
    .int()
    .positive()
    .optional()
    .meta({ description: '다음 20개를 불러올 때 지금까지 받은 마지막 글의 id' }),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label}은(는) ${max}자 이하로 입력해 주세요.` })
    .optional()
    .transform((v) => (v ? v : null));

/** POST /community/posts (multipart/form-data — 값이 모두 문자열로 옴) */
export const createPostSchema = z.object({
  category: z.enum(CATEGORY_NAMES, { error: "분류는 '질문', '기록 공유', '팁' 중 하나입니다." }),
  crop: optionalText(20, '작물'),
  title: z.string({ error: '제목을 입력해 주세요.' }).trim().min(1, { error: '제목을 입력해 주세요.' }).max(100, { error: '제목은 100자 이하로 입력해 주세요.' }),
  body: z.string({ error: '내용을 입력해 주세요.' }).trim().min(1, { error: '내용을 입력해 주세요.' }).max(5000, { error: '내용은 5000자 이하로 입력해 주세요.' }),
  attachPotId: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.coerce.number({ error: 'attachPotId는 숫자여야 합니다.' }).int().positive().optional(),
  ),
  attachPeriod: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PERIOD_NAMES, { error: "attachPeriod는 '24시간' 또는 '7일'입니다." }).optional()),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const createCommentSchema = z
  .strictObject({
    text: z.string({ error: '댓글을 입력해 주세요.' }).trim().min(1, { error: '댓글을 입력해 주세요.' }).max(1000, { error: '댓글은 1000자 이하로 입력해 주세요.' }),
  })
  .meta({ id: 'CommentCreate' });
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

const idParam = (name: string) =>
  z.coerce
    .number({ error: `${name}는 숫자여야 합니다.` })
    .int({ error: `${name}는 정수여야 합니다.` })
    .positive({ error: `${name}는 1 이상이어야 합니다.` });
export const postIdSchema = idParam('postId');
export const commentIdSchema = idParam('commentId');
