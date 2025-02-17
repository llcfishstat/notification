export enum EmailNotificationEnum {
  AUCTION_WINNER = 'AUCTION_WINNER',
  AUCTION_JOIN = 'AUCTION_JOIN',
  AUCTION_THANX = 'AUCTION_THANX',
}

export class SendEmailDto {
  email: string;
  type: EmailNotificationEnum;
  body: any;
  userId?: string;
}
