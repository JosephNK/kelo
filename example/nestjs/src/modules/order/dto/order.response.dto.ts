import type { Order } from '@/modules/order/model/order.entity';

export class OrderDataResponseDto {
  constructor(
    readonly id: string,
    readonly code: string,
  ) {}

  static from(order: Order): OrderDataResponseDto {
    return new OrderDataResponseDto(order.id, order.code);
  }
}
