import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as controller from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);
router.get('/status', controller.getSyncStatus);
router.post('/trigger', requireAdmin, controller.triggerSync);

export default router;
