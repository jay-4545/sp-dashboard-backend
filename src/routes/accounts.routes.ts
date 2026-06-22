import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as controller from '../controllers/accounts.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.listAccounts);
router.post('/', requireAdmin, controller.createAccount);
router.patch('/:id', requireAdmin, controller.updateAccount);
router.delete('/:id', requireAdmin, controller.deleteAccount);

export default router;
