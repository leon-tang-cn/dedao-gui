const express = require('express');
const { initialTables } = require('./services/db');
const loginService = require('./services/login');
const ebookService = require('./services/ebook');
const configService = require('./services/config');
const localEbooks = require('./services/localEbooks');

(async () => {
  await initialTables();

  const app = express();

  const port = 3000;
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use("/api/login", loginService);
  app.use("/api/ebook", ebookService);
  app.use("/api/config", configService);
  app.use("/api/localEbooks", localEbooks);

  app.listen(port, () => {
    console.log(`Server started on port: ${port}`);
  });
})();