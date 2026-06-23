import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config';
import { connectDatabase } from './config/database';
import './models';
import { apiRateLimiter } from './middleware/rateLimit.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { startScheduler } from './workers/scheduler';
import { expireOrphanedSyncJobsOnStartup } from './services/sync/syncRunner';
import { logger } from './utils/logger';

import authRoutes from './routes/auth.routes';
import accountsRoutes from './routes/accounts.routes';
import amazonRoutes from './routes/amazon.routes';
import dashboardRoutes from './routes/dashboard.routes';
import ordersRoutes from './routes/orders.routes';
import inventoryRoutes from './routes/inventory.routes';
import financeRoutes from './routes/finance.routes';
import syncRoutes from './routes/sync.routes';
import productsRoutes from './routes/products.routes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(apiRateLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/amazon', amazonRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/products', productsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  try {
    await connectDatabase();
    logger.info('Database connected');

    const orphaned = await expireOrphanedSyncJobsOnStartup();
    if (orphaned > 0) {
      logger.info(`Cleared ${orphaned} stuck sync job(s) from previous run`);
    }

    startScheduler();

    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

bootstrap();

export default app;
