import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as controller from '../controllers/sellerProfit.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.getSellerProfit);

export default router;
