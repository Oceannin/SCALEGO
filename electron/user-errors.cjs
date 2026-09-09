'use strict'

const PREFIX = 'SCALEGO_ERROR:'

class UserError extends Error {
  constructor(code, params = {}) {
    super(`${PREFIX}${code}:${JSON.stringify(params)}`)
    this.name = 'UserError'
    this.code = code
    this.params = params
  }
}

function errorPayload(error, fallback = 'UNEXPECTED_ERROR') {
  return {
    code: typeof error?.code === 'string' ? error.code : fallback,
    params: error?.params && typeof error.params === 'object' ? error.params : {},
  }
}

module.exports = { PREFIX, UserError, errorPayload }
