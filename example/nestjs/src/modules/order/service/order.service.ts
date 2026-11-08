import { Inject, Injectable } from '@nestjs/common';

import { formatOrderCode } from '@/modules/order/common/order-code';
import { BuyerNotFoundError } from '@/modules/order/exception/buyer-not-found.error';
import type { OrderCommandPort } from '@/modules/order/port/order-command.port';
import type { OrderRepositoryPort } from '@/modules/order/port/order-repository.port';
import { ORDER_REPOSITORY_PORT } from '@/modules/order/port/port-tokens';
import { USER_QUERY_PORT } from '@/modules/user/port/port-tokens';
import type { UserQueryPort } from '@/modules/user/port/user-query.port';

@Injectable()
export class OrderService implements OrderCommandPort {
  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orders: OrderRepositoryPort,
    @Inject(USER_QUERY_PORT)
    private readonly users: UserQueryPort,
  ) {}

  async placeOrder(buyerId: string) {
    const buyer = await this.users.findUser(buyerId);
    if (!buyer) throw new BuyerNotFoundError(buyerId);
    const id = String(Date.now());
    return this.orders.save({ id, code: formatOrderCode({ id }), buyerId });
  }
}
