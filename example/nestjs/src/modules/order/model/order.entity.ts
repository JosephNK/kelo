import type { User } from '@/modules/user/model/user.entity';

export interface Order {
  readonly id: string;
  readonly code: string;
  readonly buyerId: User['id'];
}
