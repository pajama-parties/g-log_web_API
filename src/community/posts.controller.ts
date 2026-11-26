import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { errorSchema, openApiArray, openApiSchema } from '../common/openapi.js';
import type { User } from '../database/schema/entities/auth/user.entity.js';
import {
  commentIdSchema,
  commentResponseSchema,
  createCommentSchema,
  createPostSchema,
  likeResultSchema,
  listPostsQuerySchema,
  POST_PAGE_SIZE,
  postIdSchema,
  postResponseSchema,
  type CommentResponse,
  type CreateCommentInput,
  type CreatePostInput,
  type LikeResult,
  type ListPostsQuery,
  type PostResponse,
} from './community.schemas.js';
import { CommunityService } from './community.service.js';
import { MAX_PHOTO_BYTES, type UploadedPhoto } from './photo-storage.js';

const error = (description: string) => ({ description, schema: openApiSchema(errorSchema) });
const postIdParam = ApiParam({ name: 'postId', type: String, example: '12' });
const postNotFound = ApiNotFoundResponse(error('없는 글이거나 숨김·삭제된 글 (POST_NOT_FOUND)'));

/** 커뮤니티 API. 로그인 필요 (전역 가드) */
@ApiTags('커뮤니티')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '로그인 안 됨 / access 토큰 만료 → auth 서버 POST /api/auth/refresh' })
@Controller('community/posts')
export class PostsController {
  constructor(private readonly community: CommunityService) {}

  @Get()
  @ApiQuery({ name: 'category', required: false, enum: ['질문', '기록 공유', '팁'] })
  @ApiQuery({ name: 'q', required: false, description: '제목·본문·작물·작성자에서 검색' })
  @ApiQuery({ name: 'mine', required: false, type: Boolean, description: 'true면 내가 쓴 글만' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: '다음 페이지: 지금까지 받은 마지막 글의 id' })
  @ApiOperation({
    summary: '커뮤니티 글 목록',
    description: [
      `댓글을 포함한 글을 최신순으로 ${POST_PAGE_SIZE}개씩 내려줍니다.`,
      `더 불러올 때는 받은 마지막 글의 id를 \`cursor\`로 보내고, ${POST_PAGE_SIZE}개보다 적게 오면 끝입니다.`,
      '분류·검색·내가 쓴 글 필터는 서버에서 처리합니다.',
    ].join('\n\n'),
  })
  @ApiOkResponse({ description: '글 배열. 없으면 []', schema: openApiArray(postResponseSchema) })
  @ApiBadRequestResponse({ description: 'category·mine·cursor 형식 오류, 검색어 50자 초과' })
  list(@CurrentUser() user: User, @Query({ schema: listPostsQuerySchema }) query: ListPostsQuery): Promise<PostResponse[]> {
    return this.community.list(user.id, query);
  }

  @Get(':postId')
  @postIdParam
  @ApiOperation({ summary: '글 한 건과 댓글', description: '`/community/글번호` 주소로 바로 들어왔을 때 씁니다. 목록 항목과 같은 형식입니다.' })
  @ApiOkResponse({ description: '글(한 건짜리 배열)', schema: openApiArray(postResponseSchema) })
  @postNotFound
  async get(@CurrentUser() user: User, @Param('postId', { schema: postIdSchema }) postId: number): Promise<PostResponse[]> {
    return [await this.community.get(user.id, postId)];
  }

  @Post()
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'title', 'body'],
      properties: {
        category: { type: 'string', enum: ['질문', '기록 공유', '팁'] },
        crop: { type: 'string', maxLength: 20, description: "작물. 비우면 '공통'" },
        title: { type: 'string', maxLength: 100 },
        body: { type: 'string', maxLength: 5000 },
        attachPotId: { type: 'integer', description: '그래프를 붙일 내 화분 id' },
        attachPeriod: { type: 'string', enum: ['24시간', '7일'], description: '기본 24시간' },
        photo: { type: 'string', format: 'binary', description: 'jpg·png·gif·webp, 5MB 이하' },
      },
    },
  })
  @ApiOperation({
    summary: '글 쓰기',
    description: [
      '`multipart/form-data`로 보냅니다. 사진은 `photo` 필드에 파일로 올립니다.',
      '`attachPotId`(와 `attachPeriod`)를 보내면 서버가 지금 시점의 그래프 값을 복사해 `attach`로 고정합니다. 센서 번호와 등록 코드는 글에 담지 않습니다.',
    ].join('\n\n'),
  })
  @ApiCreatedResponse({ description: '올라간 글(한 건짜리 배열)', schema: openApiArray(postResponseSchema) })
  @ApiBadRequestResponse({ description: '분류·제목·내용 누락이나 글자 수 초과, 이미지가 아닌 파일 (INVALID_PHOTO)' })
  @ApiNotFoundResponse(error('그래프를 붙일 화분이 없거나 남의 화분 (POT_NOT_FOUND)'))
  @ApiPayloadTooLargeResponse({ description: '사진이 5MB를 넘음' })
  async create(
    @CurrentUser() user: User,
    @Body({ schema: createPostSchema }) body: CreatePostInput,
    @UploadedFile() photo: UploadedPhoto | undefined,
  ): Promise<PostResponse[]> {
    return [await this.community.create(user.id, body, photo)];
  }

  @Delete(':postId')
  @HttpCode(204)
  @postIdParam
  @ApiOperation({ summary: '글 삭제', description: '내가 쓴 글만 삭제할 수 있습니다.' })
  @ApiNoContentResponse({ description: '삭제했습니다.' })
  @ApiForbiddenResponse(error('다른 사람이 쓴 글 (NOT_POST_OWNER)'))
  @postNotFound
  async remove(@CurrentUser() user: User, @Param('postId', { schema: postIdSchema }) postId: number): Promise<void> {
    await this.community.remove(user.id, postId);
  }

  @Put(':postId/like')
  @postIdParam
  @ApiOperation({ summary: '공감하기', description: '이미 공감했으면 그대로입니다.' })
  @ApiOkResponse({ description: '공감 상태(한 건짜리 배열)', schema: openApiArray(likeResultSchema) })
  @postNotFound
  async like(@CurrentUser() user: User, @Param('postId', { schema: postIdSchema }) postId: number): Promise<LikeResult[]> {
    return [await this.community.like(user.id, postId)];
  }

  @Delete(':postId/like')
  @postIdParam
  @ApiOperation({ summary: '공감 취소', description: '공감하지 않았으면 그대로입니다.' })
  @ApiOkResponse({ description: '공감 상태(한 건짜리 배열)', schema: openApiArray(likeResultSchema) })
  @postNotFound
  async unlike(@CurrentUser() user: User, @Param('postId', { schema: postIdSchema }) postId: number): Promise<LikeResult[]> {
    return [await this.community.unlike(user.id, postId)];
  }

  @Post(':postId/comments')
  @postIdParam
  @ApiOperation({ summary: '댓글 쓰기' })
  @ApiCreatedResponse({ description: '등록된 댓글(한 건짜리 배열)', schema: openApiArray(commentResponseSchema) })
  @ApiBadRequestResponse({ description: '빈 댓글, 1000자 초과' })
  @postNotFound
  async addComment(
    @CurrentUser() user: User,
    @Param('postId', { schema: postIdSchema }) postId: number,
    @Body({ schema: createCommentSchema }) body: CreateCommentInput,
  ): Promise<CommentResponse[]> {
    return [await this.community.addComment(user.id, postId, body)];
  }

  @Delete(':postId/comments/:commentId')
  @HttpCode(204)
  @postIdParam
  @ApiParam({ name: 'commentId', type: String, example: '31' })
  @ApiOperation({ summary: '댓글 삭제', description: '내가 쓴 댓글만 삭제할 수 있습니다.' })
  @ApiNoContentResponse({ description: '삭제했습니다.' })
  @ApiForbiddenResponse(error('다른 사람이 쓴 댓글 (NOT_COMMENT_OWNER)'))
  @ApiNotFoundResponse(error('없는 글·댓글 (POST_NOT_FOUND / COMMENT_NOT_FOUND)'))
  async removeComment(
    @CurrentUser() user: User,
    @Param('postId', { schema: postIdSchema }) postId: number,
    @Param('commentId', { schema: commentIdSchema }) commentId: number,
  ): Promise<void> {
    await this.community.removeComment(user.id, postId, commentId);
  }
}
