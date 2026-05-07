import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';
import { CreateExerciseDto, UpdateExerciseDto } from '@gymtracker/shared';

@Injectable()
export class ExercisesService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  findAll(userId: string) {
    return this.db.select().from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))
      .all();
  }

  findOne(id: string, userId: string) {
    const ex = this.db.select().from(schema.exercises)
      .where(and(eq(schema.exercises.id, id),
        or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1))))
      .get();
    if (!ex) throw new NotFoundException('Exercise not found');
    return ex;
  }

  create(userId: string, dto: CreateExerciseDto) {
    const id = randomUUID();
    this.db.insert(schema.exercises).values({
      id,
      userId,
      name: dto.name,
      category: dto.category ?? null,
      equipment: dto.equipment ?? null,
      notes: dto.notes ?? null,
      isDefault: 0,
      createdAt: Math.floor(Date.now() / 1000),
    }).run();
    return this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()!;
  }

  update(id: string, userId: string, dto: UpdateExerciseDto) {
    this.findOne(id, userId);
    this.db.update(schema.exercises).set(dto).where(
      and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId))
    ).run();
    return this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()!;
  }

  remove(id: string, userId: string) {
    this.findOne(id, userId);
    this.db.delete(schema.exercises).where(
      and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 0))
    ).run();
  }
}
