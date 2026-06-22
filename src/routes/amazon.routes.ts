import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as controller from '../controllers/amazon.controller';

const router = Router();

router.get('/callback', controller.oauthCallback);
router.get('/auth-url', authenticate, requireAdmin, controller.getAuthUrl);
router.delete('/disconnect/:accountId', authenticate, requireAdmin, controller.disconnect);

export default router;
