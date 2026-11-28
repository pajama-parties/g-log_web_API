import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThanOrEqual } from 'typeorm';
import { Notification } from '../database/schema/entities/service/notification.entity.js';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { UserProfile } from '../database/schema/entities/service/user-profile.entity.js';
import { toNoticeResponse, weeklySummary } from './notice-view.js';
import type { NoticeResponse, NoticeSettings, UpdateNoticeSettings, WeeklySummary } from './notices.schemas.js';

/** 알림함에 보여 줄 최대 개수 (최신순) */
export const NOTICE_LIST_LIMIT = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function noticeNotFound() {
  return new NotFoundException({ code: 'NOTICE_NOT_FOUND', message: '알림을 찾을 수 없습니다.' });
}

@Injectable()
export class NoticesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** 내 알림 최신순. 화분을 삭제했어도 알림에는 그 이름을 그대로 보여 줌 */
  async list(userId: number): Promise<NoticeResponse[]> {
    const notices = await this.db.getRepository(Notification).find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: NOTICE_LIST_LIMIT,
    });
    const plantIds = [...new Set(notices.map((n) => n.plantId).filter((id): id is number => id !== null))];
    const plants = plantIds.length
      ? await this.db.getRepository(Plant).find({ select: { id: true, name: true }, where: { id: In(plantIds) }, withDeleted: true })
      : [];
    const names = new Map(plants.map((p) => [p.id, p.name]));
    return notices.map((n) => toNoticeResponse(n, n.plantId === null ? null : (names.get(n.plantId) ?? null)));
  }

  /** 지난 7일 화분별 건조·과습·오프라인 경보 횟수. 알림함에서 지운 알림도 셈 */
  async weekly(userId: number): Promise<WeeklySummary[]> {
    const [plants, alerts] = await Promise.all([
      this.db.getRepository(Plant).find({ select: { id: true, name: true }, where: { userId }, order: { id: 'ASC' } }),
      this.db.getRepository(Notification).find({
        select: { plantId: true, tone: true },
        where: { userId, tone: In(['DRY', 'WET', 'OFFLINE']), createdAt: MoreThanOrEqual(new Date(Date.now() - WEEK_MS)) },
        withDeleted: true,
      }),
    ]);
    return weeklySummary(plants, alerts);
  }

  /** 하나 읽음. 이미 읽었으면 그대로 (읽은 시각 유지) */
  async markRead(userId: number, noticeId: number): Promise<void> {
    const notice = await this.db.getRepository(Notification).findOne({ select: { id: true, isRead: true }, where: { id: noticeId, userId } });
    if (!notice) throw noticeNotFound();
    if (!notice.isRead) {
      await this.db.getRepository(Notification).update({ id: notice.id }, { isRead: true, readAt: new Date() });
    }
  }

  async markAllRead(userId: number): Promise<void> {
    await this.db.getRepository(Notification).update({ userId, isRead: false, deletedAt: IsNull() }, { isRead: true, readAt: new Date() });
  }

  /** 알림함에서 삭제 (소프트 삭제 — 주간 요약에는 계속 셈) */
  async remove(userId: number, noticeId: number): Promise<void> {
    const result = await this.db.getRepository(Notification).softDelete({ id: noticeId, userId, deletedAt: IsNull() });
    if (!result.affected) throw noticeNotFound();
  }

  async settings(userId: number): Promise<NoticeSettings> {
    const profile = await this.db.getRepository(UserProfile).findOne({ where: { userId } });
    // 프로필은 auth 서버가 가입할 때 만듦. 혹시 없으면 기본값(모두 받기)
    return {
      dry: profile?.notifyDry ?? true,
      wet: profile?.notifyWet ?? true,
      offline: profile?.notifyOffline ?? true,
      advice: profile?.notifyAdvice ?? true,
    };
  }

  async updateSettings(userId: number, input: UpdateNoticeSettings): Promise<NoticeSettings> {
    const changes: Partial<UserProfile> = {};
    if (input.dry !== undefined) changes.notifyDry = input.dry;
    if (input.wet !== undefined) changes.notifyWet = input.wet;
    if (input.offline !== undefined) changes.notifyOffline = input.offline;
    if (input.advice !== undefined) changes.notifyAdvice = input.advice;
    if (Object.keys(changes).length > 0) {
      await this.db.getRepository(UserProfile).update({ userId }, changes);
    }
    return this.settings(userId);
  }
}
