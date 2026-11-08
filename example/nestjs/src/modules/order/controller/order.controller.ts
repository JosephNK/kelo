import { Controller, Inject, Param, Post } from '@nestjs/common';

import { OrderDataResponseDto } from '@/modules/order/dto/order.response.dto';
import type { OrderCommandPort } from '@/modules/order/port/order-command.port';
import { ORDER_COMMAND_PORT } from '@/modules/order/port/port-tokens';

@Controller('orders')
export class OrderController {
  constructor(
    @Inject(ORDER_COMMAND_PORT)
    private readonly orders: OrderCommandPort,
  ) {}

  @Post(':buyerId')
  async placeOrder(
    @Param('buyerId') buyerId: string,
  ): Promise<OrderDataResponseDto> {
    return OrderDataResponseDto.from(await this.orders.placeOrder(buyerId));
  }
}
