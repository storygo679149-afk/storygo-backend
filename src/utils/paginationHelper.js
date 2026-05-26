/**
 * Pagination helper utility
 */

class PaginationHelper {
  // Parse pagination parameters from request query
  static parsePagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;

    return {
      page,
      limit,
      offset
    };
  }

  // Build pagination response object
  static buildPaginationResponse(page, limit, total) {
    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    };
  }

  // Get pagination SQL clause
  static getPaginationSQL(page, limit) {
    const parsed = this.parsePagination({ page, limit });
    return {
      sql: `LIMIT $${parsed.limit} OFFSET $${parsed.offset}`,
      params: [parsed.limit, parsed.offset]
    };
  }
}

module.exports = PaginationHelper;