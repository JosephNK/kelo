import type { Order } from '@/modules/order/model/order.entity';

export const formatOrderCode = (order: Pick<Order, 'id'>): string =>
  `ORD-${order.id.padStart(6, '0')}`;
