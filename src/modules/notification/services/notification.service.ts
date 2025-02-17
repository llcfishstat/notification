import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { MailService } from 'src/common/services/mail.service';

import {
  EmailNotificationEnum,
  SendEmailDto,
} from '../dtos/notification.send.email.dto';
import { SendTextDto } from '../dtos/notification.send.text.dto';
import { NotificationCreateDto } from '../dtos/notification.create.dto';
import { INotificationService } from '../interfaces/notification.service.interface';
import { PrismaService } from '../../../common/services/prisma.service';
import { INotificationSendResponse } from '../interfaces/notification.interface';
import { SendInAppDto } from '../dtos/notification.send.inapp.dto';
import {
  NotificationPaginationResponseDto,
  NotificationResponseDto,
} from '../dtos/notification.response.dto';
import { NotificationUpdateDto } from '../dtos/notification.update.dto';
import { NotificationGetDto } from '../dtos/notification.get.dto';

@Injectable()
export class NotificationService implements INotificationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mainService: MailService,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {
    this.authClient.connect();
  }

  async createNotification(
    senderId: number,
    data: NotificationCreateDto,
  ): Promise<NotificationResponseDto> {
    const { body, title, type, recipientIds, subject } = data;

    const notification = await this.prismaService.notification.create({
      data: {
        title,
        body,
        type,
        senderId,
        actionPayload: {},
        subject,
      },
    });

    const recipients = [];
    for (const userId of recipientIds) {
      const recipient = await this.prismaService.recipients.create({
        data: {
          recipientId: userId,
          seenByUser: false,
          notification: { connect: { id: notification.id } },
        },
      });

      const user = await firstValueFrom(
        this.authClient.send(
          'getUserById',
          JSON.stringify({ userId: recipient.recipientId }),
        ),
      );

      recipients.push({ ...recipient, user });
    }

    const sender = await firstValueFrom(
      this.authClient.send('getUserById', JSON.stringify({ userId: senderId })),
    );

    return {
      ...notification,
      sender,
      recipients,
    };
  }

  async updateNotification(
    notificationId: string,
    data: NotificationUpdateDto,
  ): Promise<NotificationResponseDto> {
    const { body, title } = data;

    const check = await this.prismaService.notification.findUnique({
      where: {
        id: notificationId,
      },
    });

    if (!check) {
      throw new NotFoundException('notificationNotfound');
    }

    const notification = await this.prismaService.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        title,
        body,
      },
    });

    const recipientsPopulated = [];

    const recipients = await this.prismaService.recipients.findMany({
      where: {
        notificationId,
      },
    });

    for (const recipient of recipients) {
      const user = await firstValueFrom(
        this.authClient.send(
          'getUserById',
          JSON.stringify({ userId: recipient.recipientId }),
        ),
      );

      recipientsPopulated.push({ ...recipient, user });
    }

    const sender = await firstValueFrom(
      this.authClient.send(
        'getUserById',
        JSON.stringify({ userId: notification.senderId }),
      ),
    );

    return {
      ...notification,
      sender,
      recipients: recipientsPopulated,
    };
  }

  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await this.prismaService.notification.update({
        where: {
          id: notificationId,
        },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
        },
      });
      return;
    } catch (e) {
      throw e;
    }
  }

  async getNotification(
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    try {
      const notification = await this.prismaService.notification.findUnique({
        where: {
          id: notificationId,
        },
      });

      const recipientsPopulated = [];

      const recipients = await this.prismaService.recipients.findMany({
        where: {
          notificationId,
        },
      });

      for (const recipient of recipients) {
        const user = await firstValueFrom(
          this.authClient.send(
            'getUserById',
            JSON.stringify({ userId: recipient.recipientId }),
          ),
        );

        recipientsPopulated.push({ ...recipient, user });
      }

      const sender = await firstValueFrom(
        this.authClient.send(
          'getUserById',
          JSON.stringify({ userId: notification.senderId }),
        ),
      );

      return {
        ...notification,
        sender,
        recipients: recipientsPopulated,
      };
    } catch (e) {
      throw e;
    }
  }

  async getNotifications(
    userId: number,
    query: NotificationGetDto,
  ): Promise<NotificationPaginationResponseDto> {
    try {
      const { skip, take, searchTerm } = query;
      const count = await this.prismaService.notification.count({
        where: {
          ...(userId && {
            senderId: userId,
          }),
          ...(searchTerm && {
            $or: [
              {
                title: searchTerm,
              },
              {
                body: searchTerm,
              },
            ],
          }),
        },
      });
      const notifications = await this.prismaService.notification.findMany({
        where: {
          ...(userId && {
            senderId: userId,
          }),
          ...(searchTerm && {
            $or: [
              {
                title: searchTerm,
              },
              {
                body: searchTerm,
              },
            ],
          }),
        },
        skip,
        take,
      });
      const populatedNotifications = [];
      for (const notification of notifications) {
        const sender = await firstValueFrom(
          this.authClient.send(
            'getUserById',
            JSON.stringify({ userId: notification.senderId }),
          ),
        );

        const recipients = await this.prismaService.recipients.findMany({
          where: { notificationId: notification.id },
        });

        const populatedRecipients = [];
        for (const recipient of recipients) {
          const user = await firstValueFrom(
            this.authClient.send(
              'getUserById',
              JSON.stringify({ userId: recipient.recipientId }),
            ),
          );
          populatedRecipients.push({ ...recipient, user });
        }

        populatedNotifications.push({
          ...notification,
          sender,
          recipients: populatedRecipients,
        });
      }
      return {
        count,
        data: populatedNotifications,
      };
    } catch (e) {
      throw e;
    }
  }

  async sendEmail({ body, email, type }: SendEmailDto) {
    const emailType: Record<
      EmailNotificationEnum,
      MailService[
        | 'sendAuctionJoinEmail'
        | 'sendAuditionThanEmail'
        | 'sendAuctionWinnerEmail']
    > = {
      [EmailNotificationEnum.AUCTION_JOIN]:
        this.mainService.sendAuctionJoinEmail.bind(this.mainService),
      [EmailNotificationEnum.AUCTION_THANX]:
        this.mainService.sendAuditionThanEmail.bind(this.mainService),
      [EmailNotificationEnum.AUCTION_WINNER]:
        this.mainService.sendAuctionWinnerEmail.bind(this.mainService),
    };

    return emailType[type](email, body);
  }

  async sendText(_data: SendTextDto): Promise<INotificationSendResponse> {
    return Promise.resolve({
      acknowledged: true,
      status: 'OK',
      transactionId: 'test',
    });
  }

  async sendInApp(_data: SendInAppDto): Promise<INotificationSendResponse> {
    return Promise.resolve({
      acknowledged: true,
      status: 'OK',
      transactionId: 'test',
    });
  }
}
