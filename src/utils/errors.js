class AppError extends Error {
  constructor(message, statusCode = 500, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const badRequest = (message, code) => new AppError(message, 400, code);
const unauthorized = (message = 'No autorizado', code) => new AppError(message, 401, code);
const forbidden = (message = 'Prohibido', code) => new AppError(message, 403, code);
const notFound = (message = 'No encontrado', code) => new AppError(message, 404, code);
const conflict = (message, code) => new AppError(message, 409, code);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
