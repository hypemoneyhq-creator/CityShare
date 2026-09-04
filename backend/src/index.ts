import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth';
import { corridorsRouter } from './routes/corridors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // generous limit for the mock selfie upload

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', corridorsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`CityShare backend listening on :${port}`);
});
