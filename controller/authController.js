const supabase = require('./../util/supabaseClient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');

exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(
      new AppError('Please provide your name, email, and password', 400)
    );
  }

  if (typeof password !== 'string' || password.length < 8) {
    return next(new AppError('Password must be atleast 8 character long.'));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }
    }
  });

  if (error) {
    return next(new AppError(error.message || 'Signup Failed', 400));
  }

  res.status(200).json({
    status: 'success',
    data
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return next(new AppError(error.message || 'Login Failed', 404));
  }

  const token = data.session.access_token;

  res.status(200).json({
    status: 'success',
    token,
    data
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Check if token exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('You are not logged in. Please log in to get access.', 401)
    );
  }

  // 2) Verify token with Supabase
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return next(
      new AppError(
        'Invalid token or session expired. Please log in again.',
        401
      )
    );
  }

  // 3) Attach user to request
  req.user = user;
  next();
});

exports.restrictTo = (...roles) => {
  return catchAsync(async (req, res, next) => {
    // User must be authenticated first (protect middleware should run before this)
    if (!req.user) {
      return next(
        new AppError('You must be logged in to access this route.', 401)
      );
    }

    // Fetch user role from custom user table
    const { data: userData, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return next(
        new AppError('Could not fetch user role. Please try again.', 500)
      );
    }

    if (!userData || !userData.role) {
      return next(new AppError('User role not found.', 403));
    }

    // Check if user's role is in the allowed roles
    if (!roles.includes(userData.role)) {
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }

    next();
  });
};
