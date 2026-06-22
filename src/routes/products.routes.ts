import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as controller from '../controllers/accounts.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.getProducts);

export default router;
