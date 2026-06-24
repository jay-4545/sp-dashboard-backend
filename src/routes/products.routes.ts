import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as controller from '../controllers/products.controller';

const router = Router();

router.use(authenticate);

// Listings with cost + margin
router.get('/', controller.getProducts);

// COGS management
router.get('/costs', controller.listCosts);
router.post('/costs', requireAdmin, controller.upsertCost);
router.post('/costs/bulk', requireAdmin, controller.bulkUpsertCosts);

export default router;