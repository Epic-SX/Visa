import 'dotenv/config'; // Must run before any module that reads process.env
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { db } from './database/client';
import { StripeWebhookHandler } from './payment/webhook-handler';
import diagnosisRoutes from './api/diagnosis/routes';
import i18nRoutes from './api/i18n/routes';
import paymentRoutes from './api/payment/routes';

const app: Application = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());

// E-11: 未許可 origin は明示拒否（403 返却）
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean)
);
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Origin not allowed'
    });
    return;
  }
  next();
});
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / tools
    if (allowedOrigins.has(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true
}));

app.use(morgan('combined'));

app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const webhookHandler = new StripeWebhookHandler();
    await webhookHandler.handleWebhook(req, res);
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/payment', paymentRoutes);

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await db.healthCheck();
  
  if (dbHealthy) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

app.get('/health/webhook', async (req: Request, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const hasWebhookSecret = webhookSecret && webhookSecret.startsWith('whsec_');
  
  res.json({
    status: hasWebhookSecret ? 'configured' : 'not_configured',
    timestamp: new Date().toISOString(),
    webhook_endpoint: '/webhooks/stripe',
    webhook_secret_configured: hasWebhookSecret,
    message: hasWebhookSecret 
      ? 'Webhook is configured. Verify signature in Stripe Dashboard.' 
      : 'STRIPE_WEBHOOK_SECRET is not configured!'
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'VISA Risk Assessment API',
    version: '1.0.0',
    status: 'running'
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
});

async function startServer() {
  try {
    const dbHealthy = await db.healthCheck();
    
    if (!dbHealthy) {
      console.error('Database connection failed');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await db.end();
  process.exit(0);
});

export default app;
