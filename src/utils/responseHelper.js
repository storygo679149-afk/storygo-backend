/**
 * Standard API response helpers
 */

class ResponseHelper {
  // Success response
  static success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      status: 'success',
      message,
      data
    });
  }

  // Created response
  static created(res, data, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }

  // Error response
  static error(res, message = 'Internal Server Error', statusCode = 500, errors = []) {
    return res.status(statusCode).json({
      status: 'error',
      message,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  // Not found response
  static notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  // Unauthorized response
  static unauthorized(res, message = 'Unauthorized access') {
    return this.error(res, message, 401);
  }

  // Forbidden response
  static forbidden(res, message = 'Access denied') {
    return this.error(res, message, 403);
  }

  // Validation error response
  static validationError(res, message = 'Validation failed', errors = []) {
    return this.error(res, message, 422, errors);
  }

  // Conflict response
  static conflict(res, message = 'Resource already exists') {
    return this.error(res, message, 409);
  }

  // Paginated response
  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      status: 'success',
      message,
      data,
      pagination
    });
  }
}

module.exports = ResponseHelper;