import type { Notification } from '../database/schema/entities/service/notification.entity.js';
import type { Plant } from '../database/schema/entities/service/plant.entity.js';
import { TONE_LABELS, type NoticeResponse, type WeeklySummary } from './notices.schemas.js';

export function toNoticeResponse(n: Notification, potName: string | null): NoticeResponse {
  return {
    id: n.id,
    tone: TONE_LABELS[n.tone],
    pot: potName,
    potId: n.plantId,
    title: n.title,
    body: n.body,
    at: n.createdAt.toISOString(),
    unread: !n.isRead,
  };
}

/** 화분마다 한 줄 (경보가 없던 화분은 0). 이미 삭제한 화분의 경보는 뺌 */
export function weeklySummary(plants: Pick<Plant, 'id' | 'name'>[], alerts: Pick<Notification, 'plantId' | 'tone'>[]): WeeklySummary[] {
  const rows = new Map(plants.map((p) => [p.id, { potId: p.id, pot: p.name, dry: 0, wet: 0, offline: 0 }]));
  for (const a of alerts) {
    const row = a.plantId === null ? undefined : rows.get(a.plantId);
    if (!row) continue;
    if (a.tone === 'DRY') row.dry += 1;
    else if (a.tone === 'WET') row.wet += 1;
    else if (a.tone === 'OFFLINE') row.offline += 1;
  }
  return [...rows.values()];
}
