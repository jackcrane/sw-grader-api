export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export const isValidationError = (error) =>
  error instanceof ValidationError ||
  (error?.name === "ValidationError" &&
    typeof error?.message === "string" &&
    error.message.length > 0);
