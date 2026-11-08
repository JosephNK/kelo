export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
  }
}
