import { Module } from '@nestjs/common';

import { UserModule } from '@/modules/user/user.module';

import { OrderController } from './controller/order.controller';
import { ORDER_COMMAND_PORT, ORDER_REPOSITORY_PORT } from './port/port-tokens';
import { OrderRepositoryAdapter } from './provider/order-repository.adapter';
import { OrderService } from './service/order.service';

@Module({
  imports: [UserModule],
  controllers: [OrderController],
  providers: [
    { provide: ORDER_REPOSITORY_PORT, useClass: OrderRepositoryAdapter },
    { provide: ORDER_COMMAND_PORT, useClass: OrderService },
  ],
})
export class OrderModule {}
