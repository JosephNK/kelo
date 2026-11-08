import { Injectable } from '@nestjs/common';

import type { Order } from '@/modules/order/model/order.entity';
import type { OrderRepositoryPort } from '@/modules/order/port/order-repository.port';

@Injectable()
export class OrderRepositoryAdapter implements OrderRepositoryPort {
  private readonly orders = new Map<string, Order>();

  save(order: Order): Promise<Order> {
    this.orders.set(order.id, order);
    return Promise.resolve(order);
  }
}
