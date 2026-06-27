import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { MikroORM } from '@mikro-orm/core';
import { RequestContext } from '@mikro-orm/core';
import { KeyService } from './key.service';
import { KEY_ROTATION_QUEUE } from './key.constants';

/**
 * Worker-side consumer that performs scheduled signing-key rotation. Wrapped in
 * a MikroORM RequestContext because BullMQ jobs run outside the HTTP lifecycle.
 */
@Processor(KEY_ROTATION_QUEUE)
export class KeyRotationProcessor extends WorkerHost {
  private readonly logger = new Logger(KeyRotationProcessor.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly keyService: KeyService,
  ) {
    super();
  }

  async process(): Promise<void> {
    await RequestContext.create(this.orm.em, async () => {
      await this.keyService.rotate();
    });
    this.logger.log('Scheduled key rotation complete');
  }
}
