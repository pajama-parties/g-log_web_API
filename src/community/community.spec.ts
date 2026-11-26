import type { Post } from '../database/schema/entities/service/post.entity.js';
import { snapshotPoints } from './chart-snapshot.js';
import { createPostSchema, listPostsQuerySchema } from './community.schemas.js';
import { sniffImage } from './photo-storage.js';
import { escapeLike, toPostResponse } from './post-view.js';

describe('sniffImage', () => {
  it('파일 앞부분으로 형식 판별', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniffImage(Buffer.from('GIF89a....', 'latin1'))).toBe('gif');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
  });

  it('이미지가 아니면 null (확장자만 바꾼 파일, HTML 등)', () => {
    expect(sniffImage(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(Buffer.from([]))).toBeNull();
  });
});

describe('snapshotPoints', () => {
  const NOW = new Date('2026-11-25T09:30:00Z');
  it('24H: 시간별 평균, 값이 없는 구간은 빼고 오래된 값부터', () => {
    const points = snapshotPoints('24H', NOW, [
      { measuredAt: new Date('2026-11-25T09:10:00Z'), moisturePercent: 22 },
      { measuredAt: new Date('2026-11-25T07:05:00Z'), moisturePercent: 30 },
      { measuredAt: new Date('2026-11-25T07:50:00Z'), moisturePercent: 31 },
      { measuredAt: new Date('2026-11-23T00:00:00Z'), moisturePercent: 99 },
    ]);
    expect(points).toEqual([30.5, 22]);
  });
});

describe('toPostResponse', () => {
  it('코드값을 화면 문구로, id는 문자열, 작물이 없으면 공통', () => {
    const post = {
      id: 12,
      userId: 7,
      category: 'RECORD',
      crop: null,
      title: '바질 기록',
      body: '물 줬어요',
      photoUrl: null,
      likeCount: 3,
      commentCount: 0,
      isHidden: false,
      createdAt: new Date('2026-11-25T00:00:00Z'),
      deletedAt: null,
    } as Post;
    expect(toPostResponse(post, { author: '바질집사', attachment: undefined, liked: true, comments: [] }, 7)).toEqual({
      id: '12',
      category: '기록 공유',
      crop: '공통',
      author: '바질집사',
      at: '2026-11-25T00:00:00.000Z',
      mine: true,
      title: '바질 기록',
      body: '물 줬어요',
      attach: null,
      photo: null,
      likes: 3,
      liked: true,
      comments: [],
    });
  });
});

describe('요청 검사', () => {
  it('목록: mine은 문자열 true/false, cursor는 숫자', () => {
    expect(listPostsQuerySchema.parse({ mine: 'true', cursor: '40', category: '팁' })).toEqual({ mine: true, cursor: 40, category: '팁' });
    expect(listPostsQuerySchema.safeParse({ category: 'TIP' }).success).toBe(false);
  });

  it('글쓰기(multipart 문자열): 빈 작물·빈 attachPotId는 없음으로', () => {
    expect(createPostSchema.parse({ category: '질문', title: ' 잎이 노래요 ', body: '왜 그럴까요', crop: '', attachPotId: '' })).toEqual({
      category: '질문',
      title: '잎이 노래요',
      body: '왜 그럴까요',
      crop: null,
    });
    expect(createPostSchema.parse({ category: '질문', title: 't', body: 'b', attachPotId: '3', attachPeriod: '7일' })).toMatchObject({ attachPotId: 3, attachPeriod: '7일' });
    expect(createPostSchema.safeParse({ category: '질문', title: '', body: 'b' }).success).toBe(false);
  });

  it('검색어의 %, _ 는 글자 그대로', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
