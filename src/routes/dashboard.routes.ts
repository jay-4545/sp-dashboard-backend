import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as controller from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);
router.get('/summary', controller.getSummary);

export default router;
