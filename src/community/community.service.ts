import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, type EntityManager } from 'typeorm';
import { Comment } from '../database/schema/entities/service/comment.entity.js';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { PostAttachment } from '../database/schema/entities/service/post-attachment.entity.js';
import { PostLike } from '../database/schema/entities/service/post-like.entity.js';
import { Post } from '../database/schema/entities/service/post.entity.js';
import { SensorReading } from '../database/schema/entities/service/sensor-reading.entity.js';
import { UserProfile } from '../database/schema/entities/service/user-profile.entity.js';
import { snapshotFrom, snapshotPoints } from './chart-snapshot.js';
import {
  categoryCode,
  periodCode,
  PERIOD_LABELS,
  POST_PAGE_SIZE,
  type CommentResponse,
  type CreateCommentInput,
  type CreatePostInput,
  type LikeResult,
  type ListPostsQuery,
  type PostResponse,
} from './community.schemas.js';
import { PhotoStorage, type UploadedPhoto } from './photo-storage.js';
import { escapeLike, toCommentResponse, toPostResponse, UNKNOWN_AUTHOR } from './post-view.js';

const postNotFound = () => new NotFoundException({ code: 'POST_NOT_FOUND', message: '글을 찾을 수 없습니다.' });
const commentNotFound = () => new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: '댓글을 찾을 수 없습니다.' });

@Injectable()
export class CommunityService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly photos: PhotoStorage,
  ) {}

  /** 글 목록 최신순 20개. 숨김(신고 처리)·삭제한 글은 빠짐 */
  async list(viewerId: number, query: ListPostsQuery): Promise<PostResponse[]> {
    const qb = this.db.getRepository(Post).createQueryBuilder('p').where('p.isHidden = false');
    if (query.category) qb.andWhere('p.category = :category', { category: categoryCode(query.category) });
    if (query.mine) qb.andWhere('p.userId = :viewerId', { viewerId });
    if (query.cursor) qb.andWhere('p.id < :cursor', { cursor: query.cursor });
    if (query.q) {
      qb.leftJoin(UserProfile, 'u', 'u.userId = p.userId').andWhere(
        '(p.title LIKE :q OR p.body LIKE :q OR p.crop LIKE :q OR u.nickname LIKE :q)',
        { q: `%${escapeLike(query.q)}%` },
      );
    }
    const posts = await qb.orderBy('p.id', 'DESC').limit(POST_PAGE_SIZE).getMany();
    return this.hydrate(posts, viewerId);
  }

  async get(viewerId: number, postId: number): Promise<PostResponse> {
    const post = await this.findVisible(this.db.manager, postId);
    const [result] = await this.hydrate([post], viewerId);
    return result;
  }

  /** 글쓰기. 그래프를 붙이면 지금 시점의 값을 복사해 고정 (센서 번호·등록 코드는 담지 않음) */
  async create(userId: number, input: CreatePostInput, photo: UploadedPhoto | undefined): Promise<PostResponse> {
    const attachment = input.attachPotId ? await this.snapshot(userId, input.attachPotId, periodCode(input.attachPeriod ?? '24시간')) : null;
    const photoUrl = photo ? await this.photos.save('posts', photo) : null;

    let postId: number;
    try {
      postId = await this.db.transaction(async (em) => {
        const result = await em.insert(Post, {
          userId,
          category: categoryCode(input.category),
          crop: input.crop,
          title: input.title,
          body: input.body,
          photoUrl,
        });
        const id = Number(result.identifiers[0].id);
        if (attachment) await em.insert(PostAttachment, { postId: id, ...attachment });
        return id;
      });
    } catch (err) {
      if (photoUrl) await this.photos.remove(photoUrl);
      throw err;
    }
    return this.get(userId, postId);
  }

  /** 내가 쓴 글만 삭제 (소프트 삭제) */
  async remove(userId: number, postId: number): Promise<void> {
    const post = await this.findVisible(this.db.manager, postId);
    if (post.userId !== userId) throw new ForbiddenException({ code: 'NOT_POST_OWNER', message: '내가 쓴 글만 삭제할 수 있습니다.' });
    await this.db.getRepository(Post).softDelete({ id: post.id });
  }

  /** 공감. 이미 공감했으면 그대로 (여러 번 눌러도 1번) */
  async like(userId: number, postId: number): Promise<LikeResult> {
    return this.db.transaction(async (em) => {
      const post = await this.findVisible(em, postId, true);
      const result = await em.createQueryBuilder().insert().into(PostLike).values({ postId: post.id, userId }).orIgnore().execute();
      if ((result.raw as { affectedRows?: number }).affectedRows) {
        await em.increment(Post, { id: post.id }, 'likeCount', 1);
        post.likeCount += 1;
      }
      return { liked: true, likes: post.likeCount };
    });
  }

  /** 공감 취소. 공감하지 않았으면 그대로 */
  async unlike(userId: number, postId: number): Promise<LikeResult> {
    return this.db.transaction(async (em) => {
      const post = await this.findVisible(em, postId, true);
      const result = await em.delete(PostLike, { postId: post.id, userId });
      if (result.affected && post.likeCount > 0) {
        await em.decrement(Post, { id: post.id }, 'likeCount', 1);
        post.likeCount -= 1;
      }
      return { liked: false, likes: post.likeCount };
    });
  }

  async addComment(userId: number, postId: number, input: CreateCommentInput): Promise<CommentResponse> {
    const commentId = await this.db.transaction(async (em) => {
      const post = await this.findVisible(em, postId, true);
      const result = await em.insert(Comment, { postId: post.id, userId, content: input.text });
      await em.increment(Post, { id: post.id }, 'commentCount', 1);
      return Number(result.identifiers[0].id);
    });
    const comment = await this.db.getRepository(Comment).findOneByOrFail({ id: commentId });
    return toCommentResponse(comment, await this.nickname(userId), userId);
  }

  /** 내가 쓴 댓글만 삭제 (소프트 삭제) */
  async removeComment(userId: number, postId: number, commentId: number): Promise<void> {
    await this.db.transaction(async (em) => {
      const post = await this.findVisible(em, postId, true);
      const comment = await em.findOne(Comment, { where: { id: commentId, postId: post.id, isHidden: false } });
      if (!comment) throw commentNotFound();
      if (comment.userId !== userId) throw new ForbiddenException({ code: 'NOT_COMMENT_OWNER', message: '내가 쓴 댓글만 삭제할 수 있습니다.' });
      await em.softDelete(Comment, { id: comment.id });
      if (post.commentCount > 0) await em.decrement(Post, { id: post.id }, 'commentCount', 1);
    });
  }

  /** 숨김·삭제되지 않은 글. lock이면 공감·댓글 수를 바꾸는 동안 잠금 */
  private async findVisible(em: EntityManager, postId: number, lock = false): Promise<Post> {
    const post = await em.findOne(Post, { where: { id: postId, isHidden: false }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!post) throw postNotFound();
    return post;
  }

  /** 붙일 그래프: 내 화분의 지금 시점 값 */
  private async snapshot(userId: number, potId: number, period: '24H' | '7D') {
    const plant = await this.db.getRepository(Plant).findOne({ where: { id: potId, userId } });
    if (!plant) throw new NotFoundException({ code: 'POT_NOT_FOUND', message: '그래프를 붙일 화분을 찾을 수 없습니다.' });
    const now = new Date();
    const readings = await this.db.getRepository(SensorReading).find({
      select: { measuredAt: true, moisturePercent: true },
      where: { plantId: plant.id, measuredAt: MoreThanOrEqual(snapshotFrom(period, now)) },
    });
    return {
      sourcePlantId: plant.id,
      label: `${plant.name} · 최근 ${PERIOD_LABELS[period]}`,
      period,
      points: snapshotPoints(period, now, readings),
      lowerThreshold: plant.dryThreshold,
      upperThreshold: plant.wetThreshold,
    };
  }

  private async nickname(userId: number): Promise<string> {
    const profile = await this.db.getRepository(UserProfile).findOne({ select: { nickname: true }, where: { userId } });
    return profile?.nickname ?? UNKNOWN_AUTHOR;
  }

  /** 글 여러 개를 응답 형식으로: 작성자·댓글·내 공감·그래프를 한 번에 읽음 */
  private async hydrate(posts: Post[], viewerId: number): Promise<PostResponse[]> {
    if (posts.length === 0) return [];
    const ids = posts.map((p) => p.id);
    const [comments, likes, attachments] = await Promise.all([
      this.db.getRepository(Comment).find({ where: { postId: In(ids), isHidden: false }, order: { id: 'ASC' } }),
      this.db.getRepository(PostLike).find({ select: { postId: true }, where: { postId: In(ids), userId: viewerId } }),
      this.db.getRepository(PostAttachment).find({ where: { postId: In(ids) } }),
    ]);
    const userIds = [...new Set([...posts.map((p) => p.userId), ...comments.map((c) => c.userId)])];
    const profiles = await this.db.getRepository(UserProfile).find({ select: { userId: true, nickname: true }, where: { userId: In(userIds) } });
    const names = new Map(profiles.map((p) => [p.userId, p.nickname]));
    const nameOf = (id: number) => names.get(id) ?? UNKNOWN_AUTHOR;

    const liked = new Set(likes.map((l) => l.postId));
    const attachmentOf = new Map(attachments.map((a) => [a.postId, a]));
    const commentsOf = new Map<number, CommentResponse[]>();
    for (const c of comments) {
      const list = commentsOf.get(c.postId) ?? [];
      list.push(toCommentResponse(c, nameOf(c.userId), viewerId));
      commentsOf.set(c.postId, list);
    }
    return posts.map((p) =>
      toPostResponse(p, { author: nameOf(p.userId), attachment: attachmentOf.get(p.id), liked: liked.has(p.id), comments: commentsOf.get(p.id) ?? [] }, viewerId),
    );
  }
}
