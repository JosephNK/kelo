import type { Order } from '@/modules/order/model/order.entity';

export interface OrderCommandPort {
  placeOrder(buyerId: string): Promise<Order>;
}
