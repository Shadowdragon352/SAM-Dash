import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { assertPrivateConfig, privateMode, securityHeaders, demoBoundary } from './middleware/privateDemo.js';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from "cookie-parser";
import connectDB from './config/database.js'; 
import authRoutes from './routes/authRoutes.js'; 
import patientRoutes from './routes/patientRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js'; 
import messageRoutes from './routes/messageRoutes.js'; 
import userRoutes from './routes/userRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js'; 
import { ingestRouter, researchRouter } from './delirium/routes.js';
import { Device, WatchEvent, Assessment } from './delirium/models.js';
import protectedRoute from './middleware/auth.middleware.js';
import notFound from './utils/notFound.js';
import errorHandler from './utils/errorHandler.js';


dotenv.config();
assertPrivateConfig();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', privateMode() ? 1 : false);
app.use(securityHeaders);
app.use(demoBoundary);

app.use(cors({
  origin: privateMode() ? process.env.PUBLIC_ORIGIN : (process.env.CORS_ORIGIN || 'http://localhost:8080'),
  credentials: true, 
}));

app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

const PORT = process.env.PORT || 5000;

await connectDB();
await Promise.all([Device.init(), WatchEvent.init(), Assessment.init()]);

app.use('/api/v1/auth', authRoutes);

app.use('/api/v1/patients', patientRoutes);

app.use('/api/v1/doctors', protectedRoute, doctorRoutes);

app.use('/api/v1/messages', protectedRoute, messageRoutes);

app.use('/api/v1/users', protectedRoute, userRoutes);

app.use('/api/v1/notifications', protectedRoute, notificationRoutes);

app.use('/api/v1/appointments', protectedRoute, appointmentRoutes);

// Legacy utility endpoints are disabled: WatchEvent is the authoritative data store.
app.use('/api/v1', ingestRouter);
app.use('/api/v1/research', researchRouter);

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'client/dist');
if (privateMode() && existsSync(resolve(staticRoot, 'index.html'))) {
  app.use(express.static(staticRoot, { maxAge: 0 }));
  app.get('/{*path}', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(resolve(staticRoot, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('API Running'));
}

app.use(notFound)

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

