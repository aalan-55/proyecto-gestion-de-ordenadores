class HttpError extends Error {
  constructor(message, statusCode, code = "ERROR_INTERNO") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { HttpError };
