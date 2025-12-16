const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const AppError = require('./util/appError');
const globalErrorHandler = require('./controller/errorController');

const userRouter = require('./router/userRouter');
const updateRouter = require('./router/upgradeRouter');

const app = express();

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// enable morgan in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'https://portfolio-backend-n2d0.onrender.com'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(helmet());

app.use('/user', userRouter);
app.use('/user/update', updateRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
