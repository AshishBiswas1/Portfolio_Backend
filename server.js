const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });

const port = process.env.PORT;

const app = require('./app');

const server = app.listen(port, () =>
  console.log(`Server running on port: ${port}`)
);

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION', err);
  server.close(() => process.exit(1));
});
