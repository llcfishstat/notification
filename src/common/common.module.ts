import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configs from '../config';
import { PrismaService } from './services/prisma.service';
import { MailService } from './services/mail.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configs,
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      expandVariables: true,
    }),
  ],
  exports: [PrismaService, MailService],
  providers: [PrismaService, MailService],
})
export class CommonModule {}
