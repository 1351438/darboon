import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

/** Append-only security event log. Never updated or deleted. */
export class AuditLog {
  id: string = uuid();
  eventType!: string;
  userId?: string;
  applicationId?: string;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const AuditLogSchema = new EntitySchema<AuditLog>({
  class: AuditLog,
  tableName: 'audit_log',
  properties: {
    id: { type: 'uuid', primary: true },
    eventType: { type: 'string', fieldName: 'event_type', length: 100 },
    userId: { type: 'uuid', fieldName: 'user_id', nullable: true },
    applicationId: {
      type: 'uuid',
      fieldName: 'application_id',
      nullable: true,
    },
    actorId: { type: 'uuid', fieldName: 'actor_id', nullable: true },
    ip: { type: 'string', length: 64, nullable: true },
    userAgent: {
      type: 'string',
      fieldName: 'user_agent',
      length: 500,
      nullable: true,
    },
    metadata: { type: 'json', nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    { properties: ['userId', 'createdAt'] },
    { properties: ['eventType'] },
    { properties: ['createdAt'] },
  ],
});
