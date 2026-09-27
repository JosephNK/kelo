export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User ${id} not found`);
  }
}
