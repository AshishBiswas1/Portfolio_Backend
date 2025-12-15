const AppError = require('./../util/appError');

// Map common Postgres/Supabase error codes to user-friendly messages
const mapSupabaseError = err => {
  // Do not remap errors that are already operational AppError instances
  if (err && (err.isOperational || err instanceof AppError)) return null;
  // Some Supabase responses include { code, message, details, hint }
  const code = err && (err.code || (err.error && err.error.code));
  const message = err && (err.message || (err.error && err.error.message));
  const details = err && (err.details || (err.error && err.error.details));

  if (!code && !message) return null;

  // Unique violation (duplicate key)
  if (
    String(code) === '23505' ||
    (message && message.toLowerCase().includes('duplicate'))
  ) {
    const m = message || 'Duplicate field value violates unique constraint';
    return new AppError(m, 400);
  }

  // Foreign key violation or other constraint (23xxx series)
  if (String(code).startsWith && String(code).startsWith('23')) {
    const m = message || 'Database constraint error';
    return new AppError(m, 400);
  }

  // Authentication/session errors from Supabase client
  if (message && message.toLowerCase().includes('auth')) {
    return new AppError(message, 401);
  }

  // Fallback: include details if present
  if (message)
    return new AppError(message + (details ? ` - ${details}` : ''), 500);

  return null;
};

const sendErrorDev = (err, req, res) => {
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    error: err,
    message: err.message,
    stack: err.stack
  });
};

const sendErrorProd = (err, req, res) => {
  // Consider errors with explicit 4xx status codes as operational even
  // if `isOperational` wasn't set by the error class. This ensures
  // handlers that call `next(new AppError(..., 400))` return 400.
  const isOperational =
    err.isOperational || (err.statusCode && err.statusCode < 500);

  if (isOperational) {
    return res.status(err.statusCode || 400).json({
      status: err.status || 'error',
      message: err.message
    });
  }

  // Programming or unknown error: don't leak details
  console.error('UNEXPECTED ERROR:', err);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong. Please try again later.'
  });
};

// Express error handling middleware
module.exports = (err, req, res, next) => {
  // Default properties
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // If this looks like a Supabase/Postgres error, map it
  try {
    const supa = mapSupabaseError(err);
    if (supa) err = supa;
  } catch (e) {
    // ignore mapping errors
  }

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    sendErrorProd(err, req, res);
  }
};
