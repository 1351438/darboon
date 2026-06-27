import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KeyCryptoService } from './key-crypto.service';
import { KeyService } from './key.service';
import { KeyRotationProcessor } from './key-rotation.processor';
import { KEY_ROTATION_JOB, KEY_ROTATION_QUEUE } from './key.constants';
import { runsWorker } from '../config/runtime';

@Module({
  imports: [
    BullModule.registerQueue({
      name: KEY_ROTATION_QUEUE,
      defaultJobOptions: { removeOnComplete: { count: 50 }, removeOnFail: 50 },
    }),
  ],
  providers: [
    KeyCryptoService,
    KeyService,
    ...(runsWorker() ? [KeyRotationProcessor] : []),
  ],
  exports: [KeyService],
})
export class KeysModule implements OnApplicationBootstrap {
  constructor(
    private readonly config: ConfigService,
    @InjectQueue(KEY_ROTATION_QUEUE) private readonly queue: Queue,
  ) {}

  /** Register the repeatable rotation job once, from the API instance. */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.DARBOON_ROLE === 'worker') return;
    const days = this.config.get<number>('KEY_ROTATION_DAYS', 90);
    await this.queue.add(
      KEY_ROTATION_JOB,
      {},
      {
        repeat: { every: days * 24 * 60 * 60 * 1000 },
        jobId: 'scheduled-key-rotation',
      },
    );
  }
}
