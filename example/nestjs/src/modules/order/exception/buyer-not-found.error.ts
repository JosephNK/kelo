export class BuyerNotFoundError extends Error {
  constructor(buyerId: string) {
    super(`Buyer not found: ${buyerId}`);
  }
}
