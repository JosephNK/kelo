import type { Order } from '@/modules/order/model/order.entity';

export interface OrderRepositoryPort {
  save(order: Order): Promise<Order>;
}
